# n8n-like UX rules for Node Graphs (TRADE_SYSTEM)

This document captures **interaction rules** and **behavioral conventions** inspired by n8n’s workflow canvas UX, to apply consistently in our Node Graphs editor.

Scope:
- Canvas interactions (select/pan/zoom)
- Node creation + connections
- Panels (node creator / inspector)
- Keyboard shortcuts + focus rules
- Visual runtime feedback (running/success/error)

Non-scope:
- Backend execution semantics (see `docs/node-graph-system.md`)
- Module boundaries/ownership (see `docs/node-platform/README.md`)
- Styling/theme tokens (must follow our existing design system)

---

## 1) Canvas interaction model

### 1.1 Modes: **Selection** vs **Panning**
Rules:
- Default mode is **selection** (drag creates selection rectangle).
- Holding **Space** switches to **panning** mode.
- In panning mode:
  - Left mouse button drags the canvas.
  - Cursor/feel should clearly indicate panning.
- Releasing **Space** returns to selection mode.

Rationale (n8n pattern): n8n uses a dedicated panning key (Space) and differentiates selection vs panning.

### 1.2 Pan on scroll
Rules:
- Mouse wheel/trackpad scroll pans the canvas.
- Zoom should be explicit (controls or dedicated shortcuts), unless we intentionally support ctrl+wheel zoom.

### 1.3 Snap to grid
Rules:
- Nodes snap to a fixed grid.
- Grid spacing should be consistent and not user-configurable (MVP).

Rationale: n8n canvas uses a grid (and snap-to-grid) to keep workflows tidy.

---

## 2) Minimap behavior

Rules:
- Minimap exists but is **not always visible**.
- Minimap becomes visible when the user pans/moves the canvas.
- Minimap stays visible briefly after movement, then fades.
- If the minimap is hovered, it stays visible.

Rationale (n8n pattern): minimap is “contextual” and appears during navigation.

---

## 3) Zoom rules

Rules:
- Provide explicit zoom controls:
  - Zoom in
  - Zoom out
  - Reset zoom
  - Zoom-to-fit
- Provide keyboard shortcuts:
  - `+`/`=` zoom in
  - `-` zoom out
  - `0` reset zoom
  - `1` fit view
- Enforce min/max zoom bounds.

---

## 4) Node selection + traversal

### 4.1 Selection
Rules:
- Click selects a node.
- Multi-select uses standard conventions (Shift/Ctrl/Meta depending on platform).
- `Ctrl/Cmd+A` selects all nodes.

### 4.2 Keyboard traversal
Rules:
- Arrow keys move selection logically through the graph:
  - Left: select upstream (incoming)
  - Right: select downstream (outgoing)
  - Up/Down: move between siblings (same “level”)

Rationale (n8n pattern): canvas supports keyboard traversal through connected nodes.

---

## 5) Node creation (node creator)

Rules:
- Node creation should be fast, without leaving the canvas.
- `Tab` opens node creation (search/creator) from the canvas.
- Node creation from a connection is supported (create node between/after connections).
- Drag-and-drop from a node palette is allowed.

Notes:
- If multiple entry points exist (palette + Tab + edge “add”), they must behave consistently:
  - created node position is predictable (near click / near connection / near last interacted node)
  - creator closes after insert (unless user pins it)

---

## 6) Connections

Rules:
- Connect by dragging from an output handle to an input handle.
- Edges use arrowheads.
- Connections can have a label representing runtime counts (e.g., “1 item”).
- Connection validity must be enforced (type/port compatibility), and invalid drops must cancel gracefully.

Optional (but n8n-like):
- Allow clicking on a connection to insert a node (“add” on edge).

---

## 7) Run feedback and per-node status

Rules:
- Node visuals can reflect execution state:
  - running
  - success
  - error
  - waiting
- Connections can also reflect status.
- Provide per-node run data visibility (outputs count / visibility marker) without overwhelming the canvas.

---

## 8) Keyboard shortcuts (canonical set)

These are the n8n-like shortcuts we should treat as **canonical** where feasible.

Workflow-level:
- `Ctrl/Cmd+S` — save
- `Ctrl/Cmd+Enter` — run workflow

Canvas-level:
- `Ctrl/Cmd+A` — select all
- `F2` — rename node
- `Tab` — open node creator
- `Shift+S` — create sticky note (if supported)
- `Shift+Alt+T` — tidy up / auto-layout
- `+`/`=` — zoom in
- `-` — zoom out
- `0` — reset zoom
- `1` — fit view
- `Arrow keys` — traverse selection (see section 4.2)

Node-level convenience:
- `P` — pin/unpin node data (if concept exists)
- `R` — replace node (if supported)

---

## 9) Focus & “ignore shortcuts” rule

Rules:
- Canvas shortcuts MUST NOT fire when the user is typing.
- If the active element is:
  - `input`
  - `textarea`
  - `[contenteditable]`
  - or inside an element with a dedicated opt-out class (e.g. `.ignore-key-press-canvas`)
  …then ignore canvas shortcuts.

Rationale (n8n pattern): prevents collisions with text editing in panels/editors.

---

## 10) Panels: palette/creator and inspector (NDV-like)

Rules:
- The editor has a strong separation:
  - Canvas is always visible
  - Details/editing happens in a side panel (“inspector”, n8n calls it NDV / focus panel)
- Panels should be controllable by keyboard shortcuts and not obstruct core canvas navigation.

Recommended behaviors:
- Selecting a node opens the inspector.
- Inspector supports keyboard save shortcut (`Ctrl/Cmd+S`) without leaking events.
- Panels can be toggled without disturbing viewport.

---

## 11) Mapping to our current Graphs UI (status)

What we already have:
- Canvas with draggable nodes + connectable edges.
- Overlay panels (palette + inspector) over the canvas.
- Fullscreen config editor overlay.
- Save → Run integration with race avoidance.

What differs from n8n rules (gaps to consider):
- Space-to-pan mode (n8n-like) and consistent selection/pan semantics.
- Minimap visibility behavior (contextual show/hide).
- Canonical keyboard shortcuts set (Tab creator, zoom keys, tidy-up, rename).
- Selection traversal via arrow keys.
- Edge label semantics (runtime counts).

---

## 12) Implementation checklist (when we decide to apply this)

Canvas:
- [ ] Space-to-pan + selection mode
- [ ] Pan-on-scroll
- [ ] Snap-to-grid
- [ ] Minimap with contextual visibility

Keyboard:
- [ ] `Ctrl/Cmd+S` save
- [ ] `Ctrl/Cmd+Enter` run
- [ ] `Ctrl/Cmd+A` select all
- [ ] `F2` rename
- [ ] `Tab` open node creator
- [ ] `+/-/0/1` zoom and fit
- [ ] Ignore shortcuts while typing

Graph semantics UX:
- [ ] Connection validation feedback
- [ ] Runtime statuses on nodes/edges

AI workflows:
- [ ] Agent sub-connections (model + memory)
- [ ] Context-filtered node picker (model/memory)
- [ ] Chat test mode (chat + logs)
- [ ] Credentials UX (select/create, safe secrets)

Panels:
- [ ] Inspector opens on select
- [ ] Save shortcut works from inspector

---

## 13) AI chat workflows (rules from n8n Advanced AI intro tutorial)

These rules apply when we build “chat agent” style graphs (agent + chat model + optional memory) and want the UX to feel like n8n’s AI workflow builder.

### 13.1 Always-start nodes (Chat Trigger)
Rules:
- A chat workflow must have an explicit **start/trigger** node.
- For chat workflows, the canonical start node is **Chat Trigger** (or our equivalent).
- The start node is responsible for collecting the user’s message and starting an execution.

Rationale: n8n frames every workflow as “needs somewhere to start”, and for chat agents this is a dedicated chat trigger.

### 13.2 Contextual node creation (connector-first)
Rules:
- The primary “add next step” affordance is **a small add-connector on the node** (not only a global palette).
- Clicking an add-connector opens node search **filtered by what can be connected**.
  - Example: when adding a model to an agent’s “Chat Model” connection, the picker should default to language models.

Rationale: in n8n, attaching a model/memory happens from the agent’s own connection points and the picker is context-aware.

### 13.3 Agent nodes have typed “sub-connections”
Rules:
- An “AI Agent” node should visually indicate it has extra connections (beyond the normal data flow).
- At minimum, support dedicated bottom connections:
  - **Chat Model** (required)
  - **Memory** (optional)
- The agent must surface a clear “not runnable” state if required sub-connections are missing (e.g., no model attached).

Rationale: n8n treats the model and memory as attachable building blocks rather than hidden parameters.

### 13.4 Credentials are first-class and safe
Rules:
- Nodes that require external access (chat models, tools) must expose **Credentials** as a first-class selector.
- Credential UX must support:
  - selecting an existing credential
  - creating a new credential inline
- Secrets should never be re-rendered after saving; treat them as write-only.
- If a credential requires an API key, show clear guidance adjacent to the field (optionally a link to the provider).

Rationale: the tutorial flow assumes users may not have credentials yet and can add them directly from the node editor.

### 13.5 Built-in test mode: Chat + Logs
Rules:
- Chat workflows should have a dedicated **Chat** test affordance available from the canvas.
- Opening Chat test mode shows:
  - a local chat UI for sending messages
  - an execution/log view for the agent
- Logs should show the inputs/outputs for the AI Agent step clearly (including the effective system prompt).

Rationale: n8n’s tutorial uses a single click to open chat testing plus a side-by-side log view for transparency.

### 13.6 Prompt customization is additive (Options → System message)
Rules:
- Agent prompt behavior should be customizable through optional fields (not hidden, not a separate node by default).
- The “system message” (or equivalent) should be added via an “Add option” style interaction.
- The effective system message must be observable in logs.

Rationale: the tutorial teaches prompt tweaking by revealing the system prompt via logs, then editing it in optional settings.

### 13.7 Memory/persistence is explicit and attachable
Rules:
- Conversation memory must be modeled explicitly:
  - If no memory is attached, the UI should set the expectation that the agent won’t remember prior turns.
  - Attaching memory should be done from the agent’s “Memory” connection.
- Provide a simple default memory implementation (e.g., “Simple Memory”) suitable for first-time users.
- Memory should expose a single intuitive setting for “window size / last N turns”.

Rationale: the tutorial demonstrates the “agent forgets” problem, then fixes it by attaching a memory block with a default window size.

### 13.8 Save discipline (don’t lose work)
Rules:
- The editor must provide a clear “dirty” indication when changes are not saved.
- Saving must be discoverable and reliable; `Ctrl/Cmd+S` should work.
- If running relies on a saved version, the UI should make the relationship explicit (and avoid surprising users).

Rationale: the tutorial explicitly warns to save or changes are lost.

### 13.9 Mapping to our current Graphs UI (AI-specific gaps)
We already have:
- Save/run shortcuts and execution status plumbing.
- A node inspector and per-run data panels.

Gaps (to reach n8n’s AI tutorial UX):
- A “Chat test mode” UI (chat input + agent logs side-by-side) surfaced from the canvas.
- Context-filtered node pickers for agent sub-connections (model/memory).
- A clear “missing model/memory” affordance on agent nodes.

