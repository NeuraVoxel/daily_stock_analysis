import { useCallback, useEffect, useState } from "react";
import { fetchFlow } from "./api/client";
import { PeriodTabs } from "./components/PeriodTabs";
import { TimeScrubber } from "./components/TimeScrubber";
import { FlowCanvas } from "./components/FlowCanvas";
import type { FlowResponse, Period } from "./types/flow";
import "./styles/flow.css";

export default function App() {
  const [period, setPeriod] = useState<Period>("realtime");
  const [live, setLive] = useState<FlowResponse | null>(null);
  const [view, setView] = useState<FlowResponse | null>(null);
  const [snapshots, setSnapshots] = useState<FlowResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [particles, setParticles] = useState(true);

  const load = useCallback(async (p: Period) => {
    try {
      const data = await fetchFlow(p);
      setError(null);
      setLive(data);
      setView(data);
      if (p === "realtime") {
        setSnapshots((prev) => {
          if (prev.some((x) => x.as_of === data.as_of)) return prev;
          return [...prev, data].slice(-80);
        });
      } else {
        setSnapshots([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  useEffect(() => {
    if (period !== "realtime") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load("realtime");
    }, 45_000);
    return () => window.clearInterval(id);
  }, [period, load]);

  return (
    <main className="app">
      <h1>行业资金流向</h1>
      <PeriodTabs value={period} onChange={setPeriod} />
      <TimeScrubber
        enabled={period === "realtime" && snapshots.length > 1}
        marks={snapshots.map((s) => s.as_of)}
        value={view?.as_of ?? null}
        onChange={(iso) => {
          const hit = snapshots.find((s) => s.as_of === iso);
          if (hit) setView(hit);
        }}
      />
      <label className="particle-toggle">
        <input
          type="checkbox"
          checked={particles}
          onChange={(e) => setParticles(e.target.checked)}
        />
        粒子动画
      </label>
      {error && <div className="banner error">{error}</div>}
      {view?.meta.stale && <div className="banner">数据可能过期（缓存）</div>}
      {view?.meta.warnings?.map((w) => (
        <div key={w} className="banner warn">
          {w}
        </div>
      ))}
      {view ? (
        <FlowCanvas data={view} particlesEnabled={particles} />
      ) : (
        <div className="loading">加载中…</div>
      )}
      {view && (
        <footer className="app-footer">
          as_of={view.as_of} · {view.meta.source}
          {live && view.as_of !== live.as_of ? " · 历史快照" : ""}
        </footer>
      )}
    </main>
  );
}
