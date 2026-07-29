import type { Period } from "../types/flow";

const ITEMS: { id: Period; label: string }[] = [
  { id: "realtime", label: "实时" },
  { id: "day", label: "每天" },
  { id: "week", label: "每周" },
  { id: "month", label: "每月" },
  { id: "year", label: "每年" },
];

export function PeriodTabs(props: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div role="tablist" className="period-tabs">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={props.value === item.id}
          className={props.value === item.id ? "active" : ""}
          onClick={() => props.onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
