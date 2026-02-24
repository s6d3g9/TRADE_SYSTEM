from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)



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
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)



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
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)



class ConfigFileBase(BaseModel):
    scope: str = Field(min_length=1, description="Config scope (e.g., 'global', 'bot:{bot_id}')")
    owner_id: str = Field(min_length=1, description="Owner identifier")
    name: str = Field(default="config.json", description="Config file name")
    content: dict[str, Any] = Field(default_factory=dict, description="JSON config content")
    is_active: bool = Field(default=False, description="Whether this is the active config for scope/owner")


class ConfigFileCreate(ConfigFileBase):
    pass


class ConfigFileUpdate(BaseModel):
    config_id: str = Field(min_length=1)
    name: str | None = None
    content: dict[str, Any] | None = None
    is_active: bool | None = None


class ConfigFileOut(ConfigFileBase):
    config_id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)



class ModelAutotunePromptOut(BaseModel):
    prompt_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(default="")
    tags: list[str] = Field(default_factory=list)
    system_prompt: str = Field(default="")
    user_prompt_template: str = Field(default="")
    model_config = ConfigDict(from_attributes=True)



class ModelAutotunePromptListOut(BaseModel):
    items: list[ModelAutotunePromptOut] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)



class ConfigParamBase(BaseModel):
    path: str = Field(min_length=1, description="Dot-path key (dict-only).")
    value: Any = Field(description="JSON value for this path")
    value_type: str | None = Field(default=None, description="Optional value type hint")


class ConfigParamOut(ConfigParamBase):
    param_id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)



class ConfigParamsOut(BaseModel):
    config: ConfigFileOut
    params: list[ConfigParamOut]
    source: str = Field(default="stored", description="stored|materialized")
    model_config = ConfigDict(from_attributes=True)



class ConfigParamsSaveRequest(BaseModel):
    name: str | None = Field(default=None, description="Optional filename for new config")
    make_active: bool = Field(default=False, description="Activate new config for scope/owner")
    params: list[ConfigParamBase] = Field(default_factory=list)


class ConfigAuditEventOut(BaseModel):
    event_id: str
    config_id: str | None = None
    user_id: str | None = None
    scope: str
    owner_id: str
    action: str
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class ConfigAuditListOut(BaseModel):
    items: list[ConfigAuditEventOut] = Field(default_factory=list)
    limit: int
    offset: int


class ConfigFileBase(BaseModel):
    scope: str = Field(min_length=1)
    owner_id: str = Field(min_length=1)
    name: str = Field(default="config.json", min_length=1)
    content: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = Field(default=False)


class ConfigFileCreate(ConfigFileBase):
    make_active: bool = Field(default=False)


class ConfigFileUpdate(BaseModel):
    config_id: str = Field(min_length=1)
    name: str | None = None
    content: dict[str, Any] | None = None
    is_active: bool | None = None


class ConfigFileOut(ConfigFileBase):
    config_id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

