from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, maybe_current_user
from app.core.config import settings
from app.core.db import get_db
from app.models.store import StoreItem, StorePurchase
from app.models.strategylab import FreqAIModelVariant, StrategyTemplate
from app.models.user import User
from app.schemas.store import PurchaseOut, StoreItemDetailOut, StoreItemOut, StorePurchaserOut
from app.services.backtest_parser import find_backtests_for_strategy

router = APIRouter(prefix="/store", tags=["store"])


def _get_freqtrade_user_data() -> Path:
    return Path(settings.freqtrade_user_data)


def _get_store_strategies_path() -> Path:
    return _get_freqtrade_user_data() / "store" / "strategies"


def _get_store_model_configs_path() -> Path:
    return _get_freqtrade_user_data() / "store" / "model_configs"


def _parse_strategy_file(file_path: Path) -> dict[str, Any]:
    """Parse strategy file to extract metadata"""
    try:
        content = file_path.read_text(encoding="utf-8")
        
        # Extract docstring
        description = "FreqTrade Strategy"
        if '"""' in content:
            parts = content.split('"""')
            if len(parts) >= 3:
                description = parts[1].strip()
        
        # Extract class name
        class_name = file_path.stem
        for line in content.split('\n'):
            if line.strip().startswith('class ') and '(IStrategy)' in line:
                class_name = line.split('class ')[1].split('(')[0].strip()
                break
        
        return {
            "name": class_name,
            "description": description,
            "file_name": file_path.name,
            "class_name": class_name
        }
    except Exception:
        return {
            "name": file_path.stem,
            "description": "FreqTrade Strategy",
            "file_name": file_path.name,
            "class_name": file_path.stem
        }


def _parse_model_config(file_path: Path) -> dict[str, Any]:
    """Parse model config JSON to extract metadata"""
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        return {
            "name": data.get("name", file_path.stem),
            "description": data.get("description", "FreqAI Model Configuration"),
            "algorithm": data.get("algorithm", "Unknown"),
            "tags": data.get("tags", []),
            "file_name": file_path.name
        }
    except Exception:
        return {
            "name": file_path.stem,
            "description": "FreqAI Model Configuration",
            "algorithm": "Unknown",
            "tags": [],
            "file_name": file_path.name
        }


async def _ensure_store_items(session: AsyncSession) -> None:
    """Sync store items from file system"""
    
    # Sync strategies from files
    strategies_path = _get_store_strategies_path()
    if strategies_path.exists():
        for strategy_file in strategies_path.glob("*.py"):
            if strategy_file.name.startswith("_"):
                continue
            
            meta = _parse_strategy_file(strategy_file)
            slug = strategy_file.stem.lower().replace(" ", "-")
            
            existing = (
                await session.execute(
                    select(StoreItem).where(
                        StoreItem.item_type == "strategy",
                        StoreItem.slug == slug
                    )
                )
            ).scalar_one_or_none()
            
            if existing:
                existing.name = meta["name"]
                existing.description = meta["description"]
                existing.meta = meta
            else:
                session.add(
                    StoreItem(
                        item_id=str(uuid4()),
                        item_type="strategy",
                        strategy_id=None,
                        model_id=None,
                        slug=slug,
                        name=meta["name"],
                        description=meta["description"],
                        tags=["community", "strategy"],
                        meta=meta,
                        price_cents=0,
                        currency="USD",
                        is_active=True,
                    )
                )
    
    # Sync model configs from files
    model_configs_path = _get_store_model_configs_path()
    if model_configs_path.exists():
        for config_file in model_configs_path.glob("*.json"):
            meta = _parse_model_config(config_file)
            slug = config_file.stem.lower().replace(" ", "-")
            
            existing = (
                await session.execute(
                    select(StoreItem).where(
                        StoreItem.item_type == "model",
                        StoreItem.slug == slug
                    )
                )
            ).scalar_one_or_none()
            
            if existing:
                existing.name = meta["name"]
                existing.description = meta["description"]
                existing.tags = meta["tags"]
                existing.meta = meta
            else:
                session.add(
                    StoreItem(
                        item_id=str(uuid4()),
                        item_type="model",
                        strategy_id=None,
                        model_id=None,
                        slug=slug,
                        name=meta["name"],
                        description=meta["description"],
                        tags=meta["tags"] + ["community"],
                        meta=meta,
                        price_cents=0,
                        currency="USD",
                        is_active=True,
                    )
                )
    
    await session.commit()


@router.get("/items", response_model=list[StoreItemOut])
async def list_items(
    request: Request,
    item_type: str | None = Query(default=None, description="Filter: strategy|model"),
    session: AsyncSession = Depends(get_db),
) -> list[StoreItemOut]:
    await _ensure_store_items(session)

    user = await maybe_current_user(request, session)

    q = select(StoreItem).where(StoreItem.is_active.is_(True)).order_by(StoreItem.item_type.asc(), StoreItem.name.asc())
    if item_type:
        q = q.where(StoreItem.item_type == item_type)

    items = (await session.execute(q)).scalars().all()

    # Purchase counts
    counts = dict(
        (
            await session.execute(
                select(StorePurchase.item_id, func.count(StorePurchase.purchase_id)).group_by(StorePurchase.item_id)
            )
        ).all()
    )

    purchased_set: set[str] = set()
    if user:
        purchased_set = set(
            (
                await session.execute(
                    select(StorePurchase.item_id).where(StorePurchase.user_id == user.user_id)
                )
            ).scalars().all()
        )

    out: list[StoreItemOut] = []
    for it in items:
        out.append(
            StoreItemOut(
                item_id=it.item_id,
                item_type=it.item_type,
                slug=it.slug,
                name=it.name,
                description=it.description,
                tags=list(it.tags or []),
                meta=dict(it.meta or {}),
                price_cents=int(it.price_cents or 0),
                currency=str(it.currency or "USD"),
                is_active=bool(it.is_active),
                purchaser_count=int(counts.get(it.item_id, 0)),
                purchased=it.item_id in purchased_set,
            )
        )
    return out


@router.get("/items/{item_id}", response_model=StoreItemDetailOut)
async def get_item(item_id: str, request: Request, session: AsyncSession = Depends(get_db)) -> StoreItemDetailOut:
    await _ensure_store_items(session)

    user = await maybe_current_user(request, session)

    it = await session.get(StoreItem, item_id)
    if not it or not it.is_active:
        raise HTTPException(status_code=404, detail="item not found")

    # Purchasers
    purchaser_rows = (
        await session.execute(
            select(StorePurchase, User)
            .join(User, User.user_id == StorePurchase.user_id)
            .where(StorePurchase.item_id == item_id)
            .order_by(StorePurchase.created_at.desc())
            .limit(50)
        )
    ).all()

    purchasers: list[StorePurchaserOut] = []
    for purchase, purchaser in purchaser_rows:
        purchasers.append(
            StorePurchaserOut(
                user_id=purchaser.user_id,
                email=purchaser.email,
                name=purchaser.name,
                purchased_at=purchase.created_at,
            )
        )

    purchaser_count = int(
        (
            await session.execute(select(func.count(StorePurchase.purchase_id)).where(StorePurchase.item_id == item_id))
        ).scalar_one()
    )

    purchased = False
    if user:
        purchased = (
            await session.execute(
                select(StorePurchase.purchase_id).where(
                    StorePurchase.item_id == item_id,
                    StorePurchase.user_id == user.user_id,
                )
            )
        ).scalar_one_or_none() is not None

    latest_backtests: list[dict] = []
    if it.item_type == "strategy":
        # Best-effort: filter by strategy_class if present, else by name.
        strategy = await session.get(StrategyTemplate, it.strategy_id) if it.strategy_id else None
        strategy_filter = (strategy.strategy_class if strategy and strategy.strategy_class else it.name).strip()

        results_dir = _get_freqtrade_user_data() / "backtest_results"
        latest_backtests = find_backtests_for_strategy(results_dir, strategy_filter, limit=20)

    return StoreItemDetailOut(
        item_id=it.item_id,
        item_type=it.item_type,
        slug=it.slug,
        name=it.name,
        description=it.description,
        tags=list(it.tags or []),
        meta=dict(it.meta or {}),
        price_cents=int(it.price_cents or 0),
        currency=str(it.currency or "USD"),
        is_active=bool(it.is_active),
        purchaser_count=purchaser_count,
        purchased=purchased,
        purchasers=purchasers,
        latest_backtests=latest_backtests,
    )


@router.post("/items/{item_id}/purchase", response_model=PurchaseOut)
async def purchase(
    item_id: str, 
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db)
) -> PurchaseOut:
    it = await session.get(StoreItem, item_id)
    if not it or not it.is_active:
        raise HTTPException(status_code=404, detail="item not found")
    
    # Check if already purchased
    existing = (
        await session.execute(
            select(StorePurchase).where(StorePurchase.item_id == item_id, StorePurchase.user_id == user.user_id)
        )
    ).scalar_one_or_none()
    if existing:
        return PurchaseOut(ok=True, item_id=item_id, purchased_at=existing.created_at)

    # Record purchase
    purchase = StorePurchase(purchase_id=str(uuid4()), item_id=item_id, user_id=user.user_id)
    session.add(purchase)
    await session.commit()
    await session.refresh(purchase)
    
    # Copy file to user's directory after purchase
    await _copy_purchased_file(it, user)

    return PurchaseOut(ok=True, item_id=item_id, purchased_at=purchase.created_at)


async def _copy_purchased_file(item: StoreItem, user: User) -> None:
    """Copy purchased file to user's active directory and create catalog entry"""
    from app.core.db import get_sessionmaker
    
    try:
        if item.item_type == "strategy":
            # Copy strategy file to strategies directory
            file_name = item.meta.get("file_name", f"{item.slug}.py")
            source = _get_store_strategies_path() / file_name
            dest = _get_freqtrade_user_data() / "strategies" / file_name
            
            if source.exists():
                dest.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
                
                # Create catalog entry
                sessionmaker = get_sessionmaker()
                async with sessionmaker() as session:
                    existing = (
                        await session.execute(
                            select(StrategyTemplate).where(StrategyTemplate.slug == item.slug)
                        )
                    ).scalar_one_or_none()
                    
                    if not existing:
                        strategy = StrategyTemplate(
                            strategy_id=str(uuid4()),
                            slug=item.slug,
                            name=item.meta.get("name", item.name),
                            source_type="store",
                            source_url=f"store/{file_name}",
                            strategy_class=item.meta.get("class_name", item.name),
                            description=item.description,
                            tags=list(item.tags or []),
                            meta=dict(item.meta or {})
                        )
                        session.add(strategy)
                        await session.commit()
                
        elif item.item_type == "model":
            # Copy model config to configs directory
            file_name = item.meta.get("file_name", f"{item.slug}.json")
            source = _get_store_model_configs_path() / file_name
            dest = _get_freqtrade_user_data() / "configs" / file_name
            
            if source.exists():
                dest.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
                
                # Create catalog entry
                sessionmaker = get_sessionmaker()
                async with sessionmaker() as session:
                    existing = (
                        await session.execute(
                            select(FreqAIModelVariant).where(FreqAIModelVariant.slug == item.slug)
                        )
                    ).scalar_one_or_none()
                    
                    if not existing:
                        # Parse config
                        config_data = json.loads(source.read_text(encoding="utf-8"))
                        
                        model = FreqAIModelVariant(
                            model_id=str(uuid4()),
                            slug=item.slug,
                            name=item.meta.get("name", item.name),
                            algorithm=item.meta.get("algorithm", "Unknown"),
                            config=config_data.get("freqai", {}),
                            description=item.description,
                            tags=list(item.tags or [])
                        )
                        session.add(model)
                        await session.commit()
                        
    except Exception as e:
        # Log error but don't fail the purchase
        print(f"Failed to copy file for {item.slug}: {e}")
