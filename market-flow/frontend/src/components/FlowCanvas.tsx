import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowResponse } from "../types/flow";
import "../styles/flow.css";

type Props = {
  data: FlowResponse;
  particlesEnabled: boolean;
};

const W = 440;
const H = 720;
/** Narrow side labels → nodes sit farther apart for longer arcs. */
const OUT_X = 78;
const IN_X = 362;
const EXIT_X = 362;
const TEXT_LEFT = 10;
const TEXT_RIGHT = W - 10;
const LABEL_CHARS = 5;
const TOP = 48;
const BOTTOM = 668;

function nodeColor(side: string): string {
  if (side === "out") return "#39ff14";
  if (side === "in") return "#ff4d4d";
  return "#c8c8c8";
}

/** Wrap to ≤2 lines; truncate with ellipsis when longer. */
function wrapLabel(
  name: string,
  maxPerLine = LABEL_CHARS,
): [string] | [string, string] {
  const chars = Array.from(name);
  if (chars.length <= maxPerLine) return [name];
  if (chars.length <= maxPerLine * 2) {
    return [
      chars.slice(0, maxPerLine).join(""),
      chars.slice(maxPerLine).join(""),
    ];
  }
  return [
    chars.slice(0, maxPerLine).join(""),
    `${chars.slice(maxPerLine, maxPerLine * 2 - 1).join("")}…`,
  ];
}

export function FlowCanvas({ data, particlesEnabled }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const outs = data.nodes.filter((n) => n.side === "out");
  const ins = data.nodes.filter((n) => n.side === "in");
  const exitNode = data.nodes.find((n) => n.side === "exit");

  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const outSpan = BOTTOM - TOP - 40;
    outs.forEach((n, i) => {
      pos.set(n.id, {
        x: OUT_X,
        y: TOP + (i * outSpan) / Math.max(outs.length - 1, 1),
      });
    });
    const inSpan = BOTTOM - TOP - 100;
    ins.forEach((n, i) => {
      pos.set(n.id, {
        x: IN_X,
        y: TOP + (i * inSpan) / Math.max(ins.length - 1, 1),
      });
    });
    if (exitNode) pos.set(exitNode.id, { x: EXIT_X, y: BOTTOM });
    return pos;
  }, [outs, ins, exitNode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg) return;

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!particlesEnabled || reduced) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    type Particle = {
      linkIndex: number;
      t: number;
      speed: number;
      kind: "flow" | "in" | "exit";
    };
    const paths = Array.from(svg.querySelectorAll("path.flow-arc"));
    const particles: Particle[] = [];
    const maxParticles = 160;
    data.display_links.forEach((link, linkIndex) => {
      const count = Math.min(
        16,
        Math.max(2, Math.round(Math.sqrt(link.amount) * 1.2)),
      );
      const kind =
        link.to === "market_exit" ? "exit" : link.to ? "in" : "flow";
      for (let i = 0; i < count && particles.length < maxParticles; i++) {
        particles.push({
          linkIndex,
          t: Math.random(),
          speed: 0.0025 + Math.min(0.012, link.amount / 8000),
          kind: kind === "exit" ? "exit" : Math.random() > 0.35 ? "flow" : "in",
        });
      }
    });

    let raf = 0;
    const tick = () => {
      if (document.hidden) {
        raf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const p of particles) {
        const path = paths[p.linkIndex] as SVGPathElement | undefined;
        if (!path) continue;
        const len = path.getTotalLength();
        p.t = (p.t + p.speed) % 1;
        const pt = path.getPointAtLength(p.t * len);
        const color =
          p.kind === "exit"
            ? "#e8e8e8"
            : p.kind === "in"
              ? "#ff6b6b"
              : "#39ff14";
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.arc(
          pt.x * (rect.width / W),
          pt.y * (rect.height / H),
          2.4,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, particlesEnabled, layout]);

  return (
    <div className="flow-canvas">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="flow-svg">
        <text x={24} y={22} className="col-head out">
          资金流出板块 (绿色)
        </text>
        <text x={W - 24} y={22} textAnchor="end" className="col-head in">
          资金流入方向 (红色)
        </text>

        {data.display_links.map((link) => {
          const a = layout.get(link.from);
          const b = layout.get(link.to);
          if (!a || !b) return null;
          // Pull control points toward mid-gap so arcs read as long center flows.
          const gap = b.x - a.x;
          const c1x = a.x + gap * 0.42;
          const c2x = a.x + gap * 0.58;
          const d = `M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`;
          const active =
            !hoverId || hoverId === link.from || hoverId === link.to;
          return (
            <path
              key={`${link.from}-${link.to}-${link.amount}`}
              className="flow-arc"
              d={d}
              fill="none"
              stroke="#8a8a8a"
              strokeOpacity={active ? 0.35 : 0.08}
              strokeWidth={Math.min(10, 1.2 + Math.sqrt(link.amount) * 0.35)}
            />
          );
        })}

        {outs.map((n) => {
          const p = layout.get(n.id);
          if (!p) return null;
          const color = nodeColor("out");
          const lines = wrapLabel(n.name);
          return (
            <g
              key={n.id}
              className="flow-node"
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <title>{n.name}</title>
              <text
                x={TEXT_LEFT}
                y={p.y - 6}
                textAnchor="start"
                fill={color}
                fontSize={11}
                fontWeight={600}
              >
                {Math.abs(n.net).toFixed(2)}亿
              </text>
              {lines.map((line, i) => (
                <text
                  key={`${n.id}-l${i}`}
                  x={TEXT_LEFT}
                  y={p.y + 8 + i * 12}
                  textAnchor="start"
                  fill={color}
                  fontSize={11}
                >
                  {line}
                </text>
              ))}
              <rect
                x={p.x - 4}
                y={p.y - 4}
                width={8}
                height={8}
                fill={color}
                rx={1}
              />
            </g>
          );
        })}

        {ins.map((n) => {
          const p = layout.get(n.id);
          if (!p) return null;
          const color = nodeColor("in");
          const lines = wrapLabel(n.name);
          return (
            <g
              key={n.id}
              className="flow-node"
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <title>{n.name}</title>
              <rect
                x={p.x - 4}
                y={p.y - 4}
                width={8}
                height={8}
                fill={color}
                rx={1}
              />
              {lines.map((line, i) => (
                <text
                  key={`${n.id}-l${i}`}
                  x={TEXT_RIGHT}
                  y={p.y - 6 + i * 12}
                  textAnchor="end"
                  fill={color}
                  fontSize={11}
                >
                  {line}
                </text>
              ))}
              <text
                x={TEXT_RIGHT}
                y={p.y - 6 + lines.length * 12}
                textAnchor="end"
                fill={color}
                fontSize={11}
                fontWeight={600}
              >
                {Math.abs(n.net).toFixed(2)}亿
              </text>
            </g>
          );
        })}

        {exitNode &&
          (() => {
            const p = layout.get(exitNode.id);
            if (!p) return null;
            const color = nodeColor("exit");
            return (
              <g
                key={exitNode.id}
                className="flow-node"
                onMouseEnter={() => setHoverId(exitNode.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <rect
                  x={p.x - 4}
                  y={p.y - 4}
                  width={8}
                  height={8}
                  fill={color}
                  rx={1}
                />
                <text
                  x={TEXT_RIGHT}
                  y={p.y - 4}
                  textAnchor="end"
                  fill={color}
                  fontSize={12}
                >
                  市场离场
                </text>
                <text
                  x={TEXT_RIGHT}
                  y={p.y + 12}
                  textAnchor="end"
                  fill={color}
                  fontSize={12}
                  fontWeight={600}
                >
                  {Math.abs(exitNode.net).toFixed(2)}亿
                </text>
              </g>
            );
          })()}
      </svg>
      <canvas ref={canvasRef} className="flow-particles" />
    </div>
  );
}
