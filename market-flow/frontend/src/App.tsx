import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFlow } from "./api/client";
import { PeriodTabs } from "./components/PeriodTabs";
import { TimeScrubber } from "./components/TimeScrubber";
import { FlowCanvas } from "./components/FlowCanvas";
import {
  buildIntradayDemoSnapshots,
  DEMO_FRAME_MS,
} from "./demo/intradayDemo";
import type { FlowResponse, Period } from "./types/flow";
import "./styles/flow.css";

export default function App() {
  const [period, setPeriod] = useState<Period>("realtime");
  const [live, setLive] = useState<FlowResponse | null>(null);
  const [view, setView] = useState<FlowResponse | null>(null);
  const [snapshots, setSnapshots] = useState<FlowResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [particles, setParticles] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [playing, setPlaying] = useState(false);

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
    if (demoMode) return;
    void load(period);
  }, [period, load, demoMode]);

  useEffect(() => {
    if (demoMode || period !== "realtime") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load("realtime");
    }, 45_000);
    return () => window.clearInterval(id);
  }, [period, load, demoMode]);

  const startDemo = useCallback(() => {
    const frames = buildIntradayDemoSnapshots(5);
    setDemoMode(true);
    setPeriod("realtime");
    setError(null);
    setLive(null);
    setSnapshots(frames);
    setView(frames[0] ?? null);
    setPlaying(true);
  }, []);

  const exitDemo = useCallback(() => {
    setPlaying(false);
    setDemoMode(false);
    setSnapshots([]);
    void load(period);
  }, [load, period]);

  const scrubberEnabled = useMemo(
    () => (demoMode || period === "realtime") && snapshots.length > 1,
    [demoMode, period, snapshots.length],
  );

  return (
    <main className="app">
      <h1>行业资金流向</h1>
      <PeriodTabs
        value={period}
        onChange={(p) => {
          if (demoMode) {
            setPlaying(false);
            setDemoMode(false);
            setSnapshots([]);
          }
          setPeriod(p);
        }}
      />
      <div className="toolbar">
        <TimeScrubber
          enabled={scrubberEnabled}
          marks={snapshots.map((s) => s.as_of)}
          value={view?.as_of ?? null}
          playing={playing}
          onPlayingChange={setPlaying}
          frameMs={DEMO_FRAME_MS}
          onChange={(iso) => {
            const hit = snapshots.find((s) => s.as_of === iso);
            if (hit) setView(hit);
          }}
        />
        <div className="toolbar-actions">
          {!demoMode ? (
            <button type="button" className="demo-btn" onClick={startDemo}>
              演示 09:30→15:00
            </button>
          ) : (
            <button type="button" className="demo-btn active" onClick={exitDemo}>
              退出演示
            </button>
          )}
          <label className="particle-toggle">
            <input
              type="checkbox"
              checked={particles}
              onChange={(e) => setParticles(e.target.checked)}
            />
            粒子动画
          </label>
        </div>
      </div>
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
          {demoMode
            ? " · 盘中演示回放"
            : live && view.as_of !== live.as_of
              ? " · 历史快照"
              : ""}
        </footer>
      )}
    </main>
  );
}
