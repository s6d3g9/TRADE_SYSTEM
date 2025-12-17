from __future__ import annotations

import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.redis import get_redis
from app.models.strategylab import FreqAIModelVariant, StrategyAlignment, StrategyTemplate
from app.schemas.strategylab import (
    FreqAIModelVariantCreate,
    FreqAIModelVariantOut,
    FreqAIModelVariantUpdate,
    StrategyAlignmentCreate,
    StrategyAlignmentOut,
    StrategyAlignmentUpdate,
    StrategyTemplateCreate,
    StrategyTemplateOut,
    StrategyTemplateUpdate,
)

router = APIRouter(prefix="/strategylab", tags=["strategylab"])

QUEUE_KEY = "trade:tasks:queue"
TASK_KEY_PREFIX = "trade:tasks:"


_CLASS_RE = re.compile(r"^class\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*\((?P<bases>[^)]*)\)\s*:", re.MULTILINE)


def _slugify(value: str) -> str:
    v = value.strip().lower()
    v = re.sub(r"[^a-z0-9]+", "-", v)
    v = re.sub(r"-+", "-", v).strip("-")
    return v or "strategy"


def _detect_strategies(repo_root: Path, limit: int) -> list[tuple[str, str]]:
    """Return list of (class_name, relative_file_path)."""
    hits: list[tuple[str, str]] = []
    seen: set[str] = set()

    # Freqtrade convention: user_data/strategies
    preferred_dirs: list[Path] = []
    for rel in [
        Path("user_data") / "strategies",
        Path("strategies"),
        Path("user_data") / "strategies" / "NostalgiaForInfinity",
    ]:
        p = repo_root / rel
        if p.exists() and p.is_dir():
            preferred_dirs.append(p)

    search_roots = preferred_dirs if preferred_dirs else [repo_root]
    for root in search_roots:
        for py in root.rglob("*.py"):
            if py.name == "__init__.py":
                continue
            if "__pycache__" in py.parts:
                continue
            try:
                text = py.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for m in _CLASS_RE.finditer(text):
                name = m.group("name")
                bases = m.group("bases")
                if "IStrategy" not in bases:
                    continue
                if name in seen:
                    continue
                seen.add(name)
                rel_path = str(py.relative_to(repo_root))
                hits.append((name, rel_path))
                if len(hits) >= limit:
                    return hits
    return hits


@router.get("/strategies")
async def list_strategies(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(StrategyTemplate).order_by(StrategyTemplate.updated_at.desc()))
    rows = result.scalars().all()
    return [StrategyTemplateOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/strategies")
async def create_strategy(p: StrategyTemplateCreate, session: AsyncSession = Depends(get_db)) -> dict:
    s = StrategyTemplate(
        strategy_id=str(uuid4()),
        slug=p.slug,
        name=p.name,
        source_type=p.source_type,
        source_url=p.source_url,
        source_ref=p.source_ref,
        strategy_class=p.strategy_class,
        description=p.description,
        tags=p.tags,
        meta=p.meta,
    )

    session.add(s)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(s)
    return StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump()


@router.post("/strategies/import")
async def import_strategies(payload: dict, session: AsyncSession = Depends(get_db)) -> dict:
    """Import strategy templates by cloning a git repo and scanning for IStrategy classes.

    NOTE: We only store metadata (class name + repo reference). We do NOT vendor strategy code.
    """

    repo_url = str(payload.get("repo_url") or "").strip()
    ref = str(payload.get("ref") or "").strip() or None
    limit = int(payload.get("limit") or 10)
    tag = str(payload.get("tag") or "").strip() or None

    if not repo_url:
        raise HTTPException(status_code=400, detail="repo_url is required")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be 1..100")

    with tempfile.TemporaryDirectory(prefix="strategylab_import_") as tmp:
        repo_dir = Path(tmp) / "repo"

        clone_cmd = ["git", "clone", "--depth", "1"]
        if ref:
            clone_cmd += ["--branch", ref]
        clone_cmd += [repo_url, str(repo_dir)]

        try:
            subprocess.run(clone_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="git is not available in backend container")
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or e.stdout or "git clone failed").strip()
            raise HTTPException(status_code=400, detail=f"clone failed: {detail}")

        detected = _detect_strategies(repo_dir, limit=limit)

    imported: list[dict] = []
    skipped: list[dict] = []

    for class_name, rel_path in detected:
        slug = _slugify(class_name)
        tags = ["imported"]
        if tag:
            tags.append(tag)
        meta = {
            "repo_path": rel_path,
            "source": "import",
        }
        s = StrategyTemplate(
            strategy_id=str(uuid4()),
            slug=slug,
            name=class_name,
            source_type="git",
            source_url=repo_url,
            source_ref=ref,
            strategy_class=class_name,
            description=None,
            tags=tags,
            meta=meta,
        )
        session.add(s)
        try:
            await session.commit()
            await session.refresh(s)
            imported.append(StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump())
        except IntegrityError:
            await session.rollback()
            skipped.append({"slug": slug, "name": class_name, "reason": "slug already exists"})

    return {"imported": imported, "skipped": skipped, "detected": len(detected)}


@router.put("/strategies/{strategy_id}")
async def update_strategy(strategy_id: str, p: StrategyTemplateUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.strategy_id != strategy_id:
        raise HTTPException(status_code=400, detail="strategy_id mismatch")

    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")

    s.slug = p.slug
    s.name = p.name
    s.source_type = p.source_type
    s.source_url = p.source_url
    s.source_ref = p.source_ref
    s.strategy_class = p.strategy_class
    s.description = p.description
    s.tags = p.tags
    s.meta = p.meta
    s.updated_at = datetime.now(timezone.utc)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(s)
    return StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump()


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(strategy_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    s = await session.get(StrategyTemplate, strategy_id)
    if not s:
        raise HTTPException(status_code=404, detail="strategy not found")
    await session.delete(s)
    await session.commit()
    return {"deleted": True, "strategy_id": strategy_id}


@router.get("/models")
async def list_models(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(FreqAIModelVariant).order_by(FreqAIModelVariant.updated_at.desc()))
    rows = result.scalars().all()
    return [FreqAIModelVariantOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/models")
async def create_model(p: FreqAIModelVariantCreate, session: AsyncSession = Depends(get_db)) -> dict:
    m = FreqAIModelVariant(
        model_id=str(uuid4()),
        slug=p.slug,
        name=p.name,
        algorithm=p.algorithm,
        config=p.config,
        description=p.description,
        tags=p.tags,
    )

    session.add(m)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(m)
    return FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump()


@router.put("/models/{model_id}")
async def update_model(model_id: str, p: FreqAIModelVariantUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.model_id != model_id:
        raise HTTPException(status_code=400, detail="model_id mismatch")

    m = await session.get(FreqAIModelVariant, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="model not found")

    m.slug = p.slug
    m.name = p.name
    m.algorithm = p.algorithm
    m.config = p.config
    m.description = p.description
    m.tags = p.tags
    m.updated_at = datetime.now(timezone.utc)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="slug already exists")

    await session.refresh(m)
    return FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump()


@router.delete("/models/{model_id}")
async def delete_model(model_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    m = await session.get(FreqAIModelVariant, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="model not found")
    await session.delete(m)
    await session.commit()
    return {"deleted": True, "model_id": model_id}


@router.get("/alignments")
async def list_alignments(session: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await session.execute(select(StrategyAlignment).order_by(StrategyAlignment.updated_at.desc()))
    rows = result.scalars().all()
    return [StrategyAlignmentOut.model_validate(r, from_attributes=True).model_dump() for r in rows]


@router.post("/alignments")
async def create_alignment(p: StrategyAlignmentCreate, session: AsyncSession = Depends(get_db)) -> dict:
    # Validate refs exist (small and explicit)
    if not await session.get(StrategyTemplate, p.strategy_id):
        raise HTTPException(status_code=400, detail="unknown strategy_id")
    if not await session.get(FreqAIModelVariant, p.model_id):
        raise HTTPException(status_code=400, detail="unknown model_id")

    a = StrategyAlignment(
        alignment_id=str(uuid4()),
        strategy_id=p.strategy_id,
        model_id=p.model_id,
        profile=p.profile,
        scope=p.scope,
        defaults=p.defaults,
        mapping=p.mapping,
        freqtrade_overrides=p.freqtrade_overrides,
        freqai_overrides=p.freqai_overrides,
        status=p.status,
    )

    session.add(a)
    await session.commit()
    await session.refresh(a)
    return StrategyAlignmentOut.model_validate(a, from_attributes=True).model_dump()


@router.put("/alignments/{alignment_id}")
async def update_alignment(alignment_id: str, p: StrategyAlignmentUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if p.alignment_id != alignment_id:
        raise HTTPException(status_code=400, detail="alignment_id mismatch")

    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")

    if not await session.get(StrategyTemplate, p.strategy_id):
        raise HTTPException(status_code=400, detail="unknown strategy_id")
    if not await session.get(FreqAIModelVariant, p.model_id):
        raise HTTPException(status_code=400, detail="unknown model_id")

    a.strategy_id = p.strategy_id
    a.model_id = p.model_id
    a.profile = p.profile
    a.scope = p.scope
    a.defaults = p.defaults
    a.mapping = p.mapping
    a.freqtrade_overrides = p.freqtrade_overrides
    a.freqai_overrides = p.freqai_overrides
    a.status = p.status
    a.updated_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(a)
    return StrategyAlignmentOut.model_validate(a, from_attributes=True).model_dump()


@router.delete("/alignments/{alignment_id}")
async def delete_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")
    await session.delete(a)
    await session.commit()
    return {"deleted": True, "alignment_id": alignment_id}


@router.get("/alignments/{alignment_id}/export")
async def export_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    """Return a normalized JSON payload to help sync UI data with Freqtrade/FreqAI configs."""
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")
    s = await session.get(StrategyTemplate, a.strategy_id)
    m = await session.get(FreqAIModelVariant, a.model_id)
    if not s or not m:
        raise HTTPException(status_code=400, detail="alignment references missing strategy/model")

    freqtrade_cfg = {
        "strategy": s.strategy_class or s.slug,
        **(a.freqtrade_overrides or {}),
    }
    freqai_cfg: dict = {
        "profile": a.profile or "default",
        "model": {"algorithm": m.algorithm, "config": m.config or {}},
        "scope": a.scope,
        "defaults": a.defaults,
        "mapping": a.mapping,
        **(a.freqai_overrides or {}),
    }

    return {
        "strategy": StrategyTemplateOut.model_validate(s, from_attributes=True).model_dump(),
        "model": FreqAIModelVariantOut.model_validate(m, from_attributes=True).model_dump(),
        "alignment": StrategyAlignmentOut.model_validate(a, from_attributes=True).model_dump(),
        "freqtrade": freqtrade_cfg,
        "freqai": freqai_cfg,
    }


@router.post("/alignments/{alignment_id}/request-agent")
async def request_agent_alignment(alignment_id: str, session: AsyncSession = Depends(get_db)) -> dict:
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="alignment not found")

    task_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    redis = get_redis()
    key = f"{TASK_KEY_PREFIX}{task_id}"

    payload = {
        "alignment_id": alignment_id,
        "strategy_id": a.strategy_id,
        "model_id": a.model_id,
        "intent": "propose_alignment",
    }

    await redis.hset(
        key,
        mapping={
            "id": task_id,
            "type": "strategylab.alignment.propose",
            "payload": json.dumps(payload, ensure_ascii=False),
            "status": "queued",
            "created_at": now,
        },
    )
    await redis.rpush(QUEUE_KEY, task_id)

    return {"queued": True, "task_id": task_id}
