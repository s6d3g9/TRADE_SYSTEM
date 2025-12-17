import React, { useEffect, useMemo, useState } from "react";

type CheckStatus = "ok" | "down" | "unknown";

type HealthResponse = {
  status: "ok" | "degraded";
  checks?: {
    postgres?: { status?: "ok" | "down" };
    redis?: { status?: "ok" | "down" };
    exchange?: { status?: "ok" | "down" };
  };
};

function statusDotColor(status: CheckStatus): string {
  if (status === "ok") return "var(--pos)";
  if (status === "down") return "var(--neg)";
  return "var(--muted)";
}

function pillStyle(pressed: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: pressed ? "var(--selected)" : "var(--surface)",
    color: "var(--text)",
    opacity: pressed ? 1 : 0.8,
    userSelect: "none",
  };
}

export default function ConnectionPills() {
  const [apiStatus, setApiStatus] = useState<CheckStatus>("unknown");
  const [postgresStatus, setPostgresStatus] = useState<CheckStatus>("unknown");
  const [redisStatus, setRedisStatus] = useState<CheckStatus>("unknown");
  const [exchangeStatus, setExchangeStatus] = useState<CheckStatus>("unknown");
  const [wsStatus, setWsStatus] = useState<CheckStatus>("unknown");

  useEffect(() => {
    let cancelled = false;

    async function pollOnce() {
      try {
        const res = await fetch("/api/health", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as HealthResponse;

        if (cancelled) return;
        setApiStatus(data.status ? "ok" : "down");

        const pg = data.checks?.postgres?.status;
        const rd = data.checks?.redis?.status;
        const ex = data.checks?.exchange?.status;
        setPostgresStatus(pg === "ok" ? "ok" : pg === "down" ? "down" : "unknown");
        setRedisStatus(rd === "ok" ? "ok" : rd === "down" ? "down" : "unknown");
        setExchangeStatus(ex === "ok" ? "ok" : ex === "down" ? "down" : "unknown");
      } catch {
        if (cancelled) return;
        setApiStatus("down");
        setPostgresStatus("unknown");
        setRedisStatus("unknown");
        setExchangeStatus("unknown");
      }
    }

    pollOnce();
    const id = window.setInterval(pollOnce, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // WS = exchange WS reachability probe
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (cancelled) return;
      try {
        ws?.close();
      } catch {
        // ignore
      }

      setWsStatus("unknown");
      ws = new WebSocket("wss://stream.binance.com:9443/ws/!ticker@arr");
      ws.onopen = () => {
        if (!cancelled) setWsStatus("ok");
      };
      ws.onerror = () => {
        if (!cancelled) setWsStatus("down");
      };
      ws.onclose = () => {
        if (!cancelled) setWsStatus("down");
      };
    };

    connect();
    reconnectTimer = window.setInterval(() => {
      if (!ws) return;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) return;
      connect();
    }, 15000);

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearInterval(reconnectTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
      ws = null;
    };
  }, []);

  const items = useMemo(
    () => [
      { label: "API", status: apiStatus },
      { label: "WS", status: wsStatus },
      { label: "Redis", status: redisStatus },
      { label: "Postgres", status: postgresStatus },
      { label: "Exchange", status: exchangeStatus },
    ],
    [apiStatus, exchangeStatus, postgresStatus, redisStatus, wsStatus],
  );

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {items.map((it) => {
        const pressed = it.status === "ok";
        return (
          <span key={it.label} style={pillStyle(pressed)} title={it.status}>
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: statusDotColor(it.status),
              }}
            />
            <span style={{ fontSize: 12, lineHeight: "12px" }}>{it.label}</span>
          </span>
        );
      })}
    </div>
  );
}
