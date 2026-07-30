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

function formatDayTitle(iso: string | null | undefined): string {
  if (!iso) return "行业资金流向";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "行业资金流向";
  return `${y}年${Number(m)}月${Number(day)}日 全天数据`;
}

export default function App() {
  const [period, setPeriod] = useState<Period>("realtime");
  const [live, setLive] = useState<FlowResponse | null>(null);
  const [view, setView] = useState<FlowResponse | null>(null);
  const [snapshots, setSnapshots] = useState<FlowResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [particles, setParticles] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);

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

  const startDemo = useCallback(async () => {
    let seed = live;
    try {
      seed = await fetchFlow("realtime");
      setLive(seed);
      setError(null);
    } catch (e) {
      if (!seed) {
        setError(e instanceof Error ? e.message : "加载失败");
      }
    }
    const frames = buildIntradayDemoSnapshots(5, seed);
    setDemoMode(true);
    setPeriod("realtime");
    setSnapshots(frames);
    setView(frames[0] ?? null);
    setPlaying(true);
    setSpeed(1);
  }, [live]);

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

  const togglePlay = useCallback(() => {
    if (!scrubberEnabled) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    const marks = snapshots.map((s) => s.as_of);
    const last = marks[marks.length - 1];
    if (view?.as_of === last && marks[0]) {
      const hit = snapshots.find((s) => s.as_of === marks[0]);
      if (hit) setView(hit);
    }
    setPlaying(true);
  }, [scrubberEnabled, playing, snapshots, view?.as_of]);

  return (
    <main className={`app ${demoMode ? "demo-active" : ""}`.trim()}>
      <header className="app-header">
        <h1>{formatDayTitle(view?.as_of ?? live?.as_of)}</h1>
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
      </header>

      <div className="legend" aria-label="图例">
        <span>
          <i className="dot grey" />
          初始状态 (灰色)
        </span>
        <span>
          <i className="dot green" />
          资金流出 (绿)
        </span>
        <span>
          <i className="dot red" />
          资金流入 (红)
        </span>
        <span>
          <i className="dot white" />
          市场离场
        </span>
      </div>

      <TimeScrubber
        enabled={scrubberEnabled}
        marks={snapshots.map((s) => s.as_of)}
        value={view?.as_of ?? null}
        playing={playing}
        onPlayingChange={setPlaying}
        frameMs={DEMO_FRAME_MS / speed}
        showPlayButton={false}
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
        ) : null}
        <label className="particle-toggle">
          <input
            type="checkbox"
            checked={particles}
            onChange={(e) => setParticles(e.target.checked)}
          />
          粒子动画
        </label>
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

      <footer className="app-footer">
        <span>行业资金流向 · {view?.meta.source ?? "—"}</span>
        <span>仅提供数据 · 非投资建议</span>
      </footer>

      {demoMode && (
        <div className="playback-bar" role="toolbar" aria-label="演示播放控制">
          <button
            type="button"
            className="playback-close"
            aria-label="退出演示"
            onClick={exitDemo}
          >
            ×
          </button>
          <div className="playback-spacer" />
          <button
            type="button"
            className="playback-play"
            aria-pressed={playing}
            aria-label={playing ? "暂停" : "播放"}
            onClick={togglePlay}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            className="playback-speed"
            aria-label="切换播放倍速"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
          >
            {speed}x
          </button>
        </div>
      )}
    </main>
  );
}
