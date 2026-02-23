# Analysis System (Configs + Benchmark + Tuning) — Architecture

## Purpose
Build a DB-backed analysis system that allows an agent (and UI) to:

1. Store **versioned strategy/model/alignment configs** in the DB (already present).
2. Compare **backtests vs real trading** (and bots vs bots) using consistent slices.
3. Produce **reproducible analysis runs** (inputs, outputs, evidence).
4. Generate **tuning suggestions** as new config variants (not auto-applied by default).

This document defines the end-to-end architecture: data model, compute flow, APIs, and correlation toolkit.

---

## Current Foundation (Already Implemented)

### Catalog entities
- `strategy_templates`
  - Strategy source (git URL/ref), tags, meta
- `freqai_model_variants`
  - Model variant (algorithm, config), tags
- `strategy_alignments`
  - Pairing strategy ↔ model, plus overrides and status

### Versioned config storage
- `config_files`
  - Versioned JSON configs per `scope` (`strategy|model|alignment`) and `owner_id`
  - Fields already support:
    - `is_active` (single active config per scope+owner)
    - `regime` (`bull|bear|flat|regular`)
    - `kind` (`base|variant`)
    - `parent_config_id` (variant lineage)
- `config_params`
  - Materialized key/value table (`path`, `value`) for diffing/editing and analytics.

### Result storage
- `backtests`
  - DB summary metrics + `result_file_path` for detailed trade-level report
- `trades`, `positions`, `bot_sessions`
  - Real trading data storage (live/dry_run), decision metadata (where available)

---

## Key Design Goals

### 1) Reproducibility
Every analysis/tuning recommendation must be reproducible:
- exact configs used (`config_id`s)
- exact dataset/time range
- exact filters/slices
- exact metrics computed

### 2) Causality-aware analytics (avoid false conclusions)
We explicitly separate:
- **correlation** (association)
- **controlled correlation** / partial effects (control confounders)
- **robustness checks** (walk-forward, regime segmentation)

### 3) Safe activation workflow
The agent can propose config variants, but should not silently flip `is_active`:
- default: create `config_files(kind=variant, is_active=false)`
- UI (or a separate API call) explicitly promotes variant to active

---

## Concepts & Vocabulary

### Scope
- `strategy` config: base settings tied to `strategy_templates.strategy_id`
- `model` config: base settings tied to `freqai_model_variants.model_id`
- `alignment` config: combined + overrides tied to `strategy_alignments.alignment_id`

### Slice
A “slice” is a partition of performance data where the relationship is expected to be stable:
- `(pair, timeframe, regime, volatility_bucket, session_bucket, exchange, mode)`

### Reality Gap
Difference between backtest and live trading for the same slice:
- `gap(metric) = metric_live - metric_backtest`

---

## Proposed Additions (Missing Pieces)

### A) Persistent analysis provenance
We need DB entities to store analysis runs and their outputs.

#### Table: `analysis_runs`
Minimal columns:
- `run_id` (pk)
- `user_id`
- `kind` (`compare|diagnose|tune`)
- `status` (`queued|running|completed|failed`)
- `created_at`, `updated_at`, `completed_at`
- `inputs` JSON
  - selected bots/backtests, filters, slices, time ranges, metrics
- `outputs` JSON
  - metrics tables, correlations, warnings, conclusions
- `evidence` JSON
  - dataset hashes, config_ids used, version stamps

Why: auditability and deterministic reproduction.

#### Table: `tuning_suggestions`
Minimal columns:
- `suggestion_id` (pk)
- `run_id` (fk -> analysis_runs)
- `target_scope` (`strategy|model|alignment`)
- `owner_id` (id for scope)
- `base_config_id` (fk -> config_files)
- `proposed_config_id` (fk -> config_files) **OR** store `proposed_patch` JSON and mint later
- `expected_impact` JSON (metric deltas by slice)
- `risk_notes` JSON (overfit flags, sensitivity)
- `state` (`draft|accepted|rejected|superseded`)

Why: tuning is a first-class artifact (not just text).

### B) Link live bots to exact config version
To compare live trading to backtest accurately, we must know which config version was active.

Options:
1. Add `bots.active_config_id` (fk -> config_files where scope=alignment)
2. Store it in `bots.meta.active_alignment_config_id` (less strict)

Recommended: (1) for integrity and easier queries.

### C) Materialized feature snapshots for trades
If we want “why trades worked” correlations, store structured features:

- Extract `decision_log` + market context at entry into a table like `trade_features`:
  - `(trade_id, feature_key, feature_value)` or JSON column with flattened keypaths.

This mirrors `config_params`, enabling direct join-based analytics.

---

## Data Flow (End-to-End)

### 1) Config lifecycle
1. Base config created by UI or agent (stored in `config_files`, `is_active=true`)
2. Variants created for experimentation:
   - `kind=variant`, `parent_config_id=base_config_id`, `is_active=false`
3. Activation is explicit:
   - UI promotes variant by setting other configs `is_active=false` for same `(scope, owner_id, regime)`

### 2) Backtest lifecycle
1. Run backtest for a bot/alignment
2. Persist summary to `backtests`
3. Persist path to detailed report file for trade table retrieval

### 3) Live trading lifecycle
1. Bot runs (dry_run/live)
2. Trades stored in `trades` (and ideally include config_id reference via bot)
3. Optional: extract `trade_features` from decision logs + indicators at entry

### 4) Analysis lifecycle
1. UI/agent requests analysis with explicit scope:
   - compare bots
   - compare backtests vs live
   - tune parameters
2. Create `analysis_runs(status=queued)`
3. Worker executes and stores `outputs` + `evidence`
4. Agent writes `tuning_suggestions`
5. User reviews; optional promotion to active config

---

## API Surface (Proposed)

### Read config/version information
- `GET /strategylab/configs?scope=...&owner_id=...`
- `GET /strategylab/configs/{config_id}`
- `GET /strategylab/configs/{config_id}/params`

### Create variant configs
- `POST /strategylab/configs`
  - allow `kind`, `regime`, `parent_config_id`

### Promote a config
- `POST /strategylab/configs/{config_id}/activate`
  - sets `is_active=true` and deactivates siblings for same scope+owner+regime

### Analysis
- `POST /analysis/runs`
  - body: selected bots/backtests, time range, slice definitions, metric set
- `GET /analysis/runs/{run_id}`
- `GET /analysis/runs?limit&offset&kind&status`

### Suggestions
- `POST /analysis/runs/{run_id}/suggestions`
- `GET /analysis/suggestions?state&scope&owner_id`
- `POST /analysis/suggestions/{suggestion_id}/accept`
  - mints config variant (if needed) and optionally activates

---

## Correlation & Differentiation Toolkit

### 1) Metrics computed (core)
- Return: total return %, CAGR, expectancy
- Risk: max drawdown %, ulcer index, downside deviation
- Ratios: Sharpe, Sortino, Calmar
- Trade quality: win rate, profit factor, avg trade return, SQN
- Execution costs: fee/slippage impacts (when available)

### 2) Segmentation (must-have)
Compute metrics per slice:
- pair/timeframe
- regime
- volatility bucket (e.g., quartiles of realized vol)
- session bucket (e.g., Asia/EU/US)
- mode (backtest/dry_run/live)

### 3) Correlation types
- Pearson: linear association
- Spearman/Kendall: monotonic association
- Partial correlation: control confounders (pair/timeframe/regime)
- Mutual information / distance correlation: nonlinear associations
- Rolling correlations: time-varying relationships

### 4) Overfit / robustness checks
- Walk-forward / time splits (train/test) and metric stability
- Sensitivity analysis across config variants
- Multiple comparison control (FDR) when many variants tested

---

## Guardrails (Important)

### No silent activation
Agent output should never flip `is_active` without explicit user confirmation.

### Evidence-first recommendations
Every suggestion must include:
- slice(s) where improvement is expected
- risk notes (overfit / sensitivity)
- comparison baseline (base_config_id)

### Consistent units & normalization
- Always specify percent vs fraction
- Normalize per-day/per-trade where applicable

---

## Implementation Plan (Suggested Order)

1. Add `analysis_runs` and `tuning_suggestions` models + migrations
2. Add `bots.active_config_id` (or meta) to bind live data to config versions
3. Add API endpoints for analysis + suggestion lifecycle
4. Add aggregation utilities (slice metrics) and store results into `analysis_runs.outputs`
5. Extend UI pages:
   - Benchmark: attach config_id and show “reality gap”
   - Configs: variant tree + activate flow

---

## Notes on Compatibility
This design intentionally reuses the existing `config_files` + `config_params` structure.
The new analysis tables are additive and do not break current flows.
