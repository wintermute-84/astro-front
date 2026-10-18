import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

// Canvas can't read CSS vars, so the palette lives here too (keep in sync with dashboard.css).
const TEXT_3 = '#888';
const RULE = 'rgba(255,255,255,0.12)';
const MONO = '11px ui-monospace, monospace';

export interface ChartSeries {
  label: string;
  values: number[];
  color: string;
  dash?: boolean;
  /** 45° hatch instead of a solid fill (BYPASS: "not cached"). */
  hatch?: boolean;
}

interface Props {
  kind: 'line' | 'stacked';
  t: number[];
  series: ChartSeries[];
  unit: '%' | 'ms' | '';
  /** Log y-axis: edge (~40 ms) and origin (~800 ms) on one readable ms axis. */
  log?: boolean;
  /** Accessible summary; the card's TABLE toggle carries the numbers. */
  label: string;
  height?: number;
}

const fmt = (v: number | null | undefined, unit: Props['unit']) =>
  v == null ? '–' : unit === '%' ? `${(v * 100).toFixed(1)}%` : unit === 'ms' ? `${Math.round(v)} ms` : Math.round(v).toLocaleString('en');

function hatch(ctx: CanvasRenderingContext2D, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 6;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, 6);
  g.lineTo(6, 0);
  g.stroke();
  return ctx.createPattern(c, 'repeat')!;
}

// Stacked bars drawn by hand: square ends, 2px gap between segments.
function drawStacked(u: uPlot, series: ChartSeries[]) {
  const { ctx } = u;
  const n = u.data[0].length;
  const slot = u.bbox.width / n;
  const w = Math.max(1, slot * 0.72);
  const gap = 2 * uPlot.pxRatio;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = u.bbox.left + slot * i + (slot - w) / 2;
    let acc = 0;
    series.forEach((s, si) => {
      const v = s.values[i];
      if (!v) return;
      const y0 = u.valToPos(acc, 'y', true);
      const y1 = u.valToPos(acc + v, 'y', true);
      acc += v;
      const h = y0 - y1 - (si ? gap : 0);
      if (h <= 0) return;
      ctx.fillStyle = s.hatch ? hatch(ctx, s.color) : s.color;
      ctx.fillRect(x, y1, w, h);
    });
  }
  ctx.restore();
}

// Direct labels at line ends (only when there's more than one line).
function drawEndLabels(u: uPlot, series: ChartSeries[]) {
  const { ctx } = u;
  const last = u.data[0].length - 1;
  ctx.save();
  ctx.font = `${11 * uPlot.pxRatio}px ui-monospace, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  series.forEach((s) => {
    const y = u.valToPos(s.values[last], 'y', true);
    ctx.fillStyle = s.color;
    ctx.fillText(s.label, u.bbox.left + u.bbox.width - 4 * uPlot.pxRatio, y - 8 * uPlot.pxRatio);
  });
  ctx.restore();
}

// Crosshair tooltip: time + every series value at the cursor, text in text color.
function tooltipPlugin(series: ChartSeries[], unit: Props['unit']): uPlot.Plugin {
  let tip: HTMLDivElement;
  return {
    hooks: {
      init: (u) => {
        tip = document.createElement('div');
        tip.className = 'chart-tip mono';
        tip.hidden = true;
        u.over.appendChild(tip);
        u.over.addEventListener('mouseleave', () => (tip.hidden = true));
      },
      setCursor: (u) => {
        const i = u.cursor.idx;
        if (i == null) return void (tip.hidden = true);
        const when = new Date(u.data[0][i] * 1000).toISOString().slice(5, 16).replace('T', ' ');
        tip.replaceChildren(
          Object.assign(document.createElement('div'), { textContent: `${when} UTC`, className: 'chart-tip__t' }),
          ...series.map((s) => {
            const row = document.createElement('div');
            const sw = document.createElement('i');
            sw.style.background = s.color;
            row.appendChild(sw);
            row.appendChild(document.createTextNode(`${s.label} ${fmt(s.values[i], unit)}`));
            return row;
          }),
        );
        tip.hidden = false;
        const left = u.cursor.left ?? 0;
        const flip = left > u.over.clientWidth / 2;
        tip.style.transform = `translate(${flip ? `calc(${left}px - 100% - 12px)` : `${left + 12}px`}, 8px)`;
      },
    },
  };
}

export default function Chart({ kind, t, series, unit, label, log = false, height = series.length > 1 ? 214 : 240 }: Props) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current!;
    const stacked = kind === 'stacked';
    const max = stacked
      ? Math.max(...t.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0)))
      : undefined;

    // Log axis: keep 1x and 3x per decade, drop the 2..9 clutter.
    const decades = log
      ? (_u: uPlot, splits: number[]) =>
          splits.map((v) => ([1, 3].includes(Math.round(v / 10 ** Math.floor(Math.log10(v)))) ? v : null))
      : undefined;
    const axis: uPlot.Axis = { stroke: TEXT_3, font: MONO, grid: { stroke: RULE, width: 1 }, ticks: { show: false } };
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      legend: { show: false },
      cursor: { points: { show: !stacked }, drag: { x: false, y: false }, y: false },
      scales: {
        x: { time: true },
        y: stacked
          ? { range: [0, max! * 1.05] }
          : log
            ? { distr: 3, log: 10 }
            : unit === '%'
              ? { range: (_u, lo) => [Math.min(lo, 0.8), 1] }
              : {},
      },
      axes: [
        axis,
        {
          ...axis,
          size: 56,
          values: (_u, vals) => vals.map((v) => fmt(v, unit)),
          ...(decades && { filter: decades, grid: { ...axis.grid, filter: decades }, ticks: { show: false, filter: decades } }),
        },
      ],
      series: [
        {},
        ...series.map((s) =>
          stacked
            ? { label: s.label, stroke: s.color, paths: () => null, points: { show: false } }
            : { label: s.label, stroke: s.color, width: 1.75, dash: s.dash ? [6, 4] : undefined, points: { show: false } },
        ),
      ],
      hooks: {
        draw: [(u) => (stacked ? drawStacked(u, series) : series.length > 1 && drawEndLabels(u, series))],
      },
      plugins: [tooltipPlugin(series, unit)],
    };

    const plot = new uPlot(opts, [t, ...series.map((s) => s.values)], el);
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [kind, t, series, unit, log, height]);

  return (
    <figure className="chart-fig" aria-label={label} role="img" style={{ margin: 0 }}>
      {series.length > 1 && (
        <ul className="chart-legend mono" aria-hidden="true">
          {series.map((s) => (
            <li key={s.label}>
              <i style={{ background: s.hatch ? undefined : s.color, borderTop: s.dash ? `2px dashed ${s.color}` : undefined }} className={s.hatch ? 'hatch' : s.dash ? 'dash' : undefined} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={box} style={{ height }} />
    </figure>
  );
}

