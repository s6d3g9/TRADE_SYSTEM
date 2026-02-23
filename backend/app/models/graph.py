from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class NodeGraph(Base):
    __tablename__ = "node_graphs"
    __table_args__ = (
        Index("ix_node_graphs_user_created", "user_id", "created_at"),
        Index("ix_node_graphs_scope_owner", "scope", "owner_id"),
    )

    graph_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    # Where this graph applies (for future): user|bot|strategy|model|alignment
    scope: Mapped[str] = mapped_column(String, nullable=False, server_default="user")
    owner_id: Mapped[str | None] = mapped_column(String, nullable=True)

    is_active: Mapped[bool] = mapped_column(nullable=False, server_default="true")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    versions: Mapped[list["NodeGraphVersion"]] = relationship(
        "NodeGraphVersion",
        back_populates="graph",
        lazy="noload",
        cascade="all, delete-orphan",
    )
    runs: Mapped[list["NodeGraphRun"]] = relationship(
        "NodeGraphRun",
        back_populates="graph",
        lazy="noload",
        cascade="all, delete-orphan",
    )


class NodeGraphVersion(Base):
    __tablename__ = "node_graph_versions"
    __table_args__ = (
        Index("ix_node_graph_versions_graph_created", "graph_id", "created_at"),
        Index("ix_node_graph_versions_graph_version", "graph_id", "version"),
    )

    version_id: Mapped[str] = mapped_column(String, primary_key=True)
    graph_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("node_graphs.graph_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version: Mapped[int] = mapped_column(nullable=False)

    # Canonical graph definition stored as JSON.
    # Suggested shape: { nodes: [...], edges: [...], viewport: {...}, meta: {...} }
    definition: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    graph: Mapped["NodeGraph"] = relationship("NodeGraph", back_populates="versions", lazy="selectin")
    runs: Mapped[list["NodeGraphRun"]] = relationship(
        "NodeGraphRun",
        back_populates="version",
        lazy="noload",
        cascade="all, delete-orphan",
    )


class NodeGraphRun(Base):
    __tablename__ = "node_graph_runs"
    __table_args__ = (
        Index("ix_node_graph_runs_user_created", "user_id", "created_at"),
        Index("ix_node_graph_runs_graph_created", "graph_id", "created_at"),
        Index("ix_node_graph_runs_status", "status"),
        Index("ix_node_graph_runs_idem_user_graph", "user_id", "graph_id", "idempotency_key", "created_at"),
    )

    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    graph_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("node_graphs.graph_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("node_graph_versions.version_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default="queued",  # queued|running|completed|failed
    )
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    outputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    graph: Mapped["NodeGraph"] = relationship("NodeGraph", back_populates="runs", lazy="selectin")
    version: Mapped["NodeGraphVersion"] = relationship("NodeGraphVersion", back_populates="runs", lazy="selectin")
    nodes: Mapped[list["NodeGraphRunNode"]] = relationship(
        "NodeGraphRunNode",
        back_populates="run",
        lazy="noload",
        cascade="all, delete-orphan",
    )


class NodeGraphRunNode(Base):
    __tablename__ = "node_graph_run_nodes"
    __table_args__ = (
        Index("ix_node_graph_run_nodes_run", "run_id"),
        Index("ix_node_graph_run_nodes_run_node", "run_id", "node_id"),
        Index("ix_node_graph_run_nodes_status", "status"),
    )

    run_node_id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("node_graph_runs.run_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Node id from the graph definition (stable within that version)
    node_id: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        server_default="queued",  # queued|running|completed|failed|skipped
    )

    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    outputs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped["NodeGraphRun"] = relationship("NodeGraphRun", back_populates="nodes", lazy="selectin")
