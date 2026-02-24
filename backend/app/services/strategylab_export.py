from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.strategylab import FreqAIModelVariant, StrategyAlignment, StrategyTemplate
from app.schemas.strategylab import FreqAIModelVariantOut, StrategyAlignmentOut, StrategyTemplateOut


@dataclass(frozen=True, slots=True)
class AlignmentTriplet:
    alignment: StrategyAlignment
    strategy: StrategyTemplate
    model: FreqAIModelVariant


async def load_alignment_triplet(session: AsyncSession, alignment_id: str) -> AlignmentTriplet:
    a = await session.get(StrategyAlignment, alignment_id)
    if not a:
        raise NotFoundError("alignment not found")
    s = await session.get(StrategyTemplate, a.strategy_id)
    m = await session.get(FreqAIModelVariant, a.model_id)
    if not s or not m:
        raise NotFoundError("alignment references missing strategy/model")
    return AlignmentTriplet(alignment=a, strategy=s, model=m)


async def build_alignment_export_payload(session: AsyncSession, alignment_id: str) -> dict:
    """Return a normalized JSON payload to help sync UI data with Freqtrade/FreqAI configs."""

    t = await load_alignment_triplet(session, alignment_id)
    a, s, m = t.alignment, t.strategy, t.model

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
