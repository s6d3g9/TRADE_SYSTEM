from __future__ import annotations

import asyncio
import os
import subprocess
from uuid import uuid4
from datetime import datetime
from pathlib import Path

from app.core.redis import get_redis
from app.node_platform.types import NodeExecutionContext, JsonDict, NodeKindMeta, NodeKindCapabilities

from app.services.freqtrade_data import (
    ensure_freqtrade_history,
    extract_exchange_name,
    extract_pairs,
    load_freqtrade_config,
    resolve_required_timeframes,
)
from app.services.strategy_ast import analyze_strategy_file


def meta_strategylab_hyperopt() -> NodeKindMeta:
    return NodeKindMeta(
        kind="strategylab.hyperopt",
        label="Run Hyperopt",
        category="StrategyLab",
        description="Run Hyperopt strategy optimization in background (docker).",
        capabilities=NodeKindCapabilities(side_effects=True, idempotent=False, long_running=True),
        inputs=("strategy_name", "epochs", "spaces", "timerange", "hyperopt_loss", "job_workers"),
        outputs=("job_id", "status", "output")
    )

async def handle_strategylab_hyperopt(ctx: NodeExecutionContext) -> JsonDict:
    """
    Executes Hyperopt inside a docker container, similar to the API implementation.
    This node streams logs to Redis (using the same 'hyperopt:logs:{job_id}' key).
    """

    # 1. Parse inputs
    # Inputs can come from literal config ('ctx.inputs') OR from upstream node outputs.
    # The merged dictionary 'ctx.inputs' is usually available.
    strategy_name = ctx.inputs.get("strategy_name")
    epochs = ctx.inputs.get("epochs", 100)
    spaces = ctx.inputs.get("spaces", "buy sell roi stoploss trailing protection")
    timerange = ctx.inputs.get("timerange", "20240101-")
    hyperopt_loss = ctx.inputs.get("hyperopt_loss", "SharpeHyperOptLoss")
    job_workers = ctx.inputs.get("job_workers", 1)

    try:
        job_workers_i = int(job_workers)
    except Exception:
        job_workers_i = 1

    if job_workers_i != -1 and (job_workers_i < 1 or job_workers_i > 32):
        job_workers_i = 1

    if not strategy_name:
         # Attempt to find "strategy_name" from an upstream output if the naming differs?
         # For now, require it in inputs.
         return {"error": "Missing required input: strategy_name"}

    job_id = str(uuid4())[:8] # or use ctx.run_id + node_id

    # 2. Redis Setup
    redis = get_redis()
    key_logs = f"hyperopt:logs:{job_id}"
    key_status = f"hyperopt:status:{job_id}"
    
    await redis.set(key_status, "running")
    await redis.expire(key_status, 3600)
    await redis.expire(key_logs, 3600)
    
    await redis.rpush(key_logs, f"[NODE] Starting Hyperopt Node. Strategy: {strategy_name}, Epochs: {epochs}")

    async def log(line: str) -> None:
        if (line or "").strip():
            await redis.rpush(key_logs, str(line))

    # 3. Prepare Docker Command
    user_data_host_path = os.getenv("FREQTRADE_USER_DATA_HOST", "/workspaces/TRADE_SYSTEM/freqtrade/user_data")
    space_list = spaces.split()

    tr = str(timerange).strip() if timerange is not None else ""
    loss = str(hyperopt_loss).strip() if hyperopt_loss is not None else ""
    if loss == "":
        loss = "SharpeHyperOptLoss"
    
    cmd = [
        "docker", "run", "--rm",
        "--name", f"hyperopt_node_{job_id}",
        "-v", f"{user_data_host_path}:/freqtrade/user_data",
        "freqtradeorg/freqtrade:stable",
        "hyperopt",
        "--config", "/freqtrade/user_data/config.json",
        "--strategy", strategy_name,
        "--hyperopt-loss", loss,
        "--spaces", *space_list,
        "--epochs", str(epochs),
        "--job-workers", str(job_workers_i),
        "--no-color"
    ]

    if tr:
        cmd.extend(["--timerange", tr])

    # Ensure historical data exists before starting hyperopt.
    try:
        cfg = load_freqtrade_config(Path("/freqtrade/user_data"))
        exchange = extract_exchange_name(cfg)
        pairs = extract_pairs(cfg)

        safe_name = "".join([c for c in str(strategy_name) if c.isalnum() or c == "_"])
        strategy_path = Path("/freqtrade/user_data/strategies") / f"{safe_name}.py"
        tf = "5m"
        if strategy_path.exists():
            try:
                analysis = analyze_strategy_file(strategy_path)
                tf = (analysis.timeframe or "5m").strip() or "5m"
            except Exception:
                tf = "5m"

        timeframes = resolve_required_timeframes(config=cfg, strategy_path=strategy_path if strategy_path.exists() else None, base_timeframe=tf)
        if not timeframes:
            timeframes = [tf]

        await ensure_freqtrade_history(
            user_data_host_path=user_data_host_path,
            user_data_internal_path=Path("/freqtrade/user_data"),
            exchange=exchange,
            pairs=pairs,
            timeframes=timeframes,
            timerange=tr or None,
            log=log,
        )
    except Exception as e:
        await redis.set(key_status, "failed")
        await log(f"[SYSTEM] Data preparation failed: {str(e)}")
        return {"ok": False, "job_id": job_id, "status": "failed", "error": f"Data preparation failed: {str(e)}"}

    # 4. Execute Process
    log_filename = ""
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            line_str = line.decode().rstrip()
            if line_str:
                await log(line_str)

        code = await process.wait()
        
        # 5. Handle Results
        if code == 0:
            await redis.set(key_status, "completed")
            await log("[SYSTEM] Hyperopt finished successfully.")
            
            # Save logs (similar to API)
            try:
                all_logs = await redis.lrange(key_logs, 0, -1)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M")
                log_filename = f"{strategy_name}_{timestamp}_node_hyperopt.log"
                
                # Internal container path
                internal_path = Path("/freqtrade/user_data/hyperopt_results/logs")
                internal_path.mkdir(parents=True, exist_ok=True)
                
                with open(internal_path / log_filename, "w") as f:
                    f.write("\n".join(all_logs))
                
                await redis.rpush(key_logs, f"[SYSTEM] Log saved to {log_filename}")

            except Exception as e:
                await redis.rpush(key_logs, f"[SYSTEM] Failed to save log file: {str(e)}")
            
            return {
                "ok": True,
                "job_id": job_id,
                "status": "completed",
                "output_log_path": str(Path("hyperopt_results/logs") / log_filename)
            }
        else:
            await redis.set(key_status, "failed")
            return {
                "ok": False,
                "job_id": job_id,
                "status": "failed",
                "error": f"Exit code {code}"
            }

    except Exception as e:
        await redis.set(key_status, "error")
        await log(f"[SYSTEM] Error executing task: {str(e)}")
        return {"ok": False, "error": str(e)}
