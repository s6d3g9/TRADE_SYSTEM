from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class StrategyTemplateBase(BaseModel):
    slug: str = Field(min_length=1)
    name: str = Field(min_length=1)
    source_type: str = Field(default="git")
    source_url: str = Field(min_length=1)
    source_ref: str | None = None
    strategy_class: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)


class StrategyTemplateCreate(StrategyTemplateBase):
    pass


class StrategyTemplateUpdate(StrategyTemplateBase):
    strategy_id: str = Field(min_length=1)


class StrategyTemplateOut(StrategyTemplateBase):
    strategy_id: str
    created_at: str | None = None
    updated_at: str | None = None


class FreqAIModelVariantBase(BaseModel):
    slug: str = Field(min_length=1)
    name: str = Field(min_length=1)
    algorithm: str = Field(min_length=1)
    config: dict[str, Any] = Field(default_factory=dict)
    description: str | None = None
    tags: list[str] = Field(default_factory=list)


class FreqAIModelVariantCreate(FreqAIModelVariantBase):
    pass


class FreqAIModelVariantUpdate(FreqAIModelVariantBase):
    model_id: str = Field(min_length=1)


class FreqAIModelVariantOut(FreqAIModelVariantBase):
    model_id: str
    created_at: str | None = None
    updated_at: str | None = None


class StrategyAlignmentBase(BaseModel):
    strategy_id: str = Field(min_length=1)
    model_id: str = Field(min_length=1)
    profile: str | None = None

    scope: dict[str, Any] | None = None
    defaults: dict[str, Any] | None = None
    mapping: dict[str, Any] | None = None

    freqtrade_overrides: dict[str, Any] = Field(default_factory=dict)
    freqai_overrides: dict[str, Any] = Field(default_factory=dict)

    status: str = Field(default="draft")


class StrategyAlignmentCreate(StrategyAlignmentBase):
    pass


class StrategyAlignmentUpdate(StrategyAlignmentBase):
    alignment_id: str = Field(min_length=1)


class StrategyAlignmentOut(StrategyAlignmentBase):
    alignment_id: str
    created_at: str | None = None
    updated_at: str | None = None
