import { useEffect, useRef } from "react";

const TICKS = ["9:30", "10:30", "11:30", "13:00", "14:00", "15:00"];

export function TimeScrubber(props: {
  enabled: boolean;
  marks: string[];
  value: string | null;
  onChange: (iso: string) => void;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  frameMs?: number;
  clockLabel?: string | null;
  /** Hide built-in play button when an external playback bar is used. */
  showPlayButton?: boolean;
}) {
  const max = Math.max(props.marks.length - 1, 0);
  const index = props.value
    ? Math.max(0, props.marks.indexOf(props.value))
    : max;
  const playing = Boolean(
    props.playing && props.enabled && props.marks.length > 1,
  );
  const onChangeRef = useRef(props.onChange);
  const onPlayingChangeRef = useRef(props.onPlayingChange);
  onChangeRef.current = props.onChange;
  onPlayingChangeRef.current = props.onPlayingChange;
  const showPlay = props.showPlayButton !== false;

  useEffect(() => {
    if (!playing) return;
    const frameMs = props.frameMs ?? 160;
    const id = window.setInterval(() => {
      const marks = props.marks;
      if (marks.length < 2) return;
      const current = props.value ? marks.indexOf(props.value) : -1;
      const next = current < 0 ? 0 : current + 1;
      if (next >= marks.length) {
        onPlayingChangeRef.current?.(false);
        return;
      }
      const mark = marks[next];
      if (mark) onChangeRef.current(mark);
    }, frameMs);
    return () => window.clearInterval(id);
  }, [playing, props.frameMs, props.marks, props.value]);

  const canPlay = props.enabled && props.marks.length > 1;
  const clock =
    props.clockLabel ?? (props.value ? props.value.slice(11, 16) : null);
  const progress = max > 0 ? (index / max) * 100 : 0;

  return (
    <div className={`scrubber ${props.enabled ? "" : "disabled"}`.trim()}>
      {showPlay && (
        <div className="scrubber-controls">
          <button
            type="button"
            className="scrubber-play"
            disabled={!canPlay}
            aria-pressed={playing}
            onClick={() => {
              if (!canPlay) return;
              if (playing) {
                onPlayingChangeRef.current?.(false);
                return;
              }
              if (index >= max && props.marks[0]) {
                onChangeRef.current(props.marks[0]);
              }
              onPlayingChangeRef.current?.(true);
            }}
          >
            {playing ? "暂停" : "播放"}
          </button>
        </div>
      )}

      <div className="timeline">
        <div className="timeline-track">
          <div className="timeline-fill" style={{ width: `${progress}%` }} />
          {props.enabled && clock && (
            <div
              className="timeline-marker"
              style={{ left: `${progress}%` }}
              aria-hidden
            >
              <span className="timeline-marker-label">{clock}</span>
            </div>
          )}
          <input
            role="slider"
            type="range"
            min={0}
            max={max}
            value={index}
            disabled={!props.enabled || props.marks.length === 0}
            aria-valuetext={clock ?? undefined}
            onChange={(e) => {
              onPlayingChangeRef.current?.(false);
              const i = Number(e.target.value);
              const mark = props.marks[i];
              if (mark) props.onChange(mark);
            }}
          />
        </div>
        <div className="scrubber-labels">
          {TICKS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
