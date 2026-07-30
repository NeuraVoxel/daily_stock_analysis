import { useEffect, useRef } from "react";

export function TimeScrubber(props: {
  enabled: boolean;
  marks: string[];
  value: string | null;
  onChange: (iso: string) => void;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  frameMs?: number;
  clockLabel?: string | null;
}) {
  const max = Math.max(props.marks.length - 1, 0);
  const index = props.value
    ? Math.max(0, props.marks.indexOf(props.value))
    : max;
  const playing = Boolean(props.playing && props.enabled && props.marks.length > 1);
  const onChangeRef = useRef(props.onChange);
  const onPlayingChangeRef = useRef(props.onPlayingChange);
  onChangeRef.current = props.onChange;
  onPlayingChangeRef.current = props.onPlayingChange;

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

  return (
    <div className="scrubber">
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
            // Restart from open if already at the last mark.
            if (index >= max && props.marks[0]) {
              onChangeRef.current(props.marks[0]);
            }
            onPlayingChangeRef.current?.(true);
          }}
        >
          {playing ? "暂停" : "播放"}
        </button>
        <span className="scrubber-clock" aria-live="polite">
          {props.clockLabel ??
            (props.value ? props.value.slice(11, 16) : "—:—")}
        </span>
      </div>
      <input
        role="slider"
        type="range"
        min={0}
        max={max}
        value={index}
        disabled={!props.enabled || props.marks.length === 0}
        onChange={(e) => {
          onPlayingChangeRef.current?.(false);
          const i = Number(e.target.value);
          const mark = props.marks[i];
          if (mark) props.onChange(mark);
        }}
      />
      <div className="scrubber-labels">
        <span>09:30</span>
        <span>11:30</span>
        <span>13:00</span>
        <span>15:00</span>
      </div>
    </div>
  );
}
