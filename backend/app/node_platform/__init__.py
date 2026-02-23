"""Node platform (n8n-inspired) backend primitives.

This package provides a minimal node-kind registry and execution handler contracts.
It is intentionally small; higher-level orchestration remains in graphs + workers.
"""

from .registry import NodeRegistry, get_default_node_registry
from .types import NodeKindCapabilities, NodeKindMeta

__all__ = ["NodeRegistry", "get_default_node_registry", "NodeKindCapabilities", "NodeKindMeta"]
