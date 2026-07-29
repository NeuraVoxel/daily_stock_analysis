import { useEffect, useMemo, useRef, useState } from "react";
import type { FlowResponse } from "../types/flow";
import "../styles/flow.css";

type Props = {
  data: FlowResponse;
  particlesEnabled: boolean;
};

export function FlowCanvas({ data, particlesEnabled }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const outs = data.nodes.filter((n) => n.side === "out");
  const ins = data.nodes.filter((n) => n.side === "in");
  const exitNode = data.nodes.find((n) => n.side === "exit");

  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    outs.forEach((n, i) => {
      pos.set(n.id, {
        x: 120,
        y: 40 + (i * 600) / Math.max(outs.length - 1, 1),
      });
    });
    ins.forEach((n, i) => {
      pos.set(n.id, {
        x: 780,
        y: 40 + (i * 520) / Math.max(ins.length - 1, 1),
      });
    });
    if (exitNode) pos.set(exitNode.id, { x: 820, y: 640 });
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
      toExit: boolean;
    };
    const paths = Array.from(svg.querySelectorAll("path"));
    const particles: Particle[] = [];
    const maxParticles = 120;
    data.display_links.forEach((link, linkIndex) => {
      const count = Math.min(
        12,
        Math.max(1, Math.round(Math.sqrt(link.amount))),
      );
      for (let i = 0; i < count && particles.length < maxParticles; i++) {
        particles.push({
          linkIndex,
          t: Math.random(),
          speed: 0.002 + Math.min(0.01, link.amount / 5000),
          toExit: link.to === "market_exit",
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
        ctx.beginPath();
        ctx.fillStyle = p.toExit ? "#f5f5f5" : "#4ade80";
        ctx.globalAlpha = 0.85;
        ctx.arc(
          pt.x * (rect.width / 1000),
          pt.y * (rect.height / 700),
          2.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, particlesEnabled, layout]);

  return (
    <div className="flow-canvas">
      <svg ref={svgRef} viewBox="0 0 1000 700" className="flow-svg">
        {data.display_links.map((link) => {
          const a = layout.get(link.from);
          const b = layout.get(link.to);
          if (!a || !b) return null;
          const midX = (a.x + b.x) / 2;
          const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
          const active =
            !hoverId || hoverId === link.from || hoverId === link.to;
          return (
            <path
              key={`${link.from}-${link.to}-${link.amount}`}
              d={d}
              fill="none"
              stroke="#22c55e"
              strokeOpacity={active ? 0.55 : 0.12}
              strokeWidth={Math.min(18, 2 + Math.sqrt(link.amount))}
            />
          );
        })}
        {data.nodes.map((n) => {
          const p = layout.get(n.id);
          if (!p) return null;
          const color =
            n.side === "out"
              ? "#22c55e"
              : n.side === "in"
                ? "#ef4444"
                : "#f5f5f5";
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <circle cx={p.x} cy={p.y} r={5} fill={color} />
              <text
                x={n.side === "out" ? p.x - 12 : p.x + 12}
                y={p.y + 4}
                textAnchor={n.side === "out" ? "end" : "start"}
                fill={color}
                fontSize={14}
              >
                {n.name} {Math.abs(n.net).toFixed(2)}亿
              </text>
            </g>
          );
        })}
      </svg>
      <canvas ref={canvasRef} className="flow-particles" />
    </div>
  );
}
