export function TimeScrubber(props: {
  enabled: boolean;
  marks: string[];
  value: string | null;
  onChange: (iso: string) => void;
}) {
  const max = Math.max(props.marks.length - 1, 0);
  const index = props.value
    ? Math.max(0, props.marks.indexOf(props.value))
    : max;
  return (
    <div className="scrubber">
      <input
        role="slider"
        type="range"
        min={0}
        max={max}
        value={index}
        disabled={!props.enabled || props.marks.length === 0}
        onChange={(e) => {
          const i = Number(e.target.value);
          const mark = props.marks[i];
          if (mark) props.onChange(mark);
        }}
      />
      <div className="scrubber-labels">
        <span>09:30</span>
        <span>11:30</span>
        <span>15:00</span>
      </div>
    </div>
  );
}
