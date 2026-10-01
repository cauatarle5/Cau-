import type { AnalyticsSummary } from '@atlas/schemas';

type Status = AnalyticsSummary['volume'][number]['status'];

export const STATUS_LABELS: Record<Status | 'none', string> = {
  none: 'Sem séries',
  below_mev: 'Abaixo do mínimo',
  minimum: 'Mínimo',
  productive: 'Produtivo',
  high: 'Alto',
  above_mrv: 'Acima do máximo',
};

export const STATUS_FILL: Record<Status | 'none', string> = {
  none: 'var(--muted)',
  below_mev: '#f87171',
  minimum: '#fbbf24',
  productive: '#34d399',
  high: '#60a5fa',
  above_mrv: '#a78bfa',
};

type Shape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

/** Regiões esquemáticas (frente à esquerda, costas à direita), espelhadas nos dois lados. */
const FRONT: Record<string, Shape[]> = {
  chest: [{ kind: 'rect', x: 34, y: 44, w: 32, h: 16 }],
  front_delts: [
    { kind: 'ellipse', cx: 30, cy: 44, rx: 6, ry: 6 },
    { kind: 'ellipse', cx: 70, cy: 44, rx: 6, ry: 6 },
  ],
  side_delts: [
    { kind: 'ellipse', cx: 24, cy: 46, rx: 4, ry: 6 },
    { kind: 'ellipse', cx: 76, cy: 46, rx: 4, ry: 6 },
  ],
  biceps: [
    { kind: 'rect', x: 20, y: 54, w: 7, h: 18 },
    { kind: 'rect', x: 73, y: 54, w: 7, h: 18 },
  ],
  forearms: [
    { kind: 'rect', x: 17, y: 74, w: 7, h: 20 },
    { kind: 'rect', x: 76, y: 74, w: 7, h: 20 },
  ],
  abs: [{ kind: 'rect', x: 42, y: 62, w: 16, h: 26 }],
  obliques: [
    { kind: 'rect', x: 34, y: 64, w: 7, h: 22 },
    { kind: 'rect', x: 59, y: 64, w: 7, h: 22 },
  ],
  adductors: [
    { kind: 'rect', x: 45, y: 96, w: 4, h: 18 },
    { kind: 'rect', x: 51, y: 96, w: 4, h: 18 },
  ],
  quads: [
    { kind: 'rect', x: 34, y: 94, w: 10, h: 32 },
    { kind: 'rect', x: 56, y: 94, w: 10, h: 32 },
  ],
  calves: [
    { kind: 'rect', x: 36, y: 132, w: 8, h: 22 },
    { kind: 'rect', x: 56, y: 132, w: 8, h: 22 },
  ],
};

const BACK: Record<string, Shape[]> = {
  traps: [{ kind: 'rect', x: 40, y: 36, w: 20, h: 8 }],
  rear_delts: [
    { kind: 'ellipse', cx: 28, cy: 45, rx: 6, ry: 6 },
    { kind: 'ellipse', cx: 72, cy: 45, rx: 6, ry: 6 },
  ],
  upper_back: [{ kind: 'rect', x: 36, y: 46, w: 28, h: 10 }],
  lats: [
    { kind: 'rect', x: 33, y: 57, w: 12, h: 20 },
    { kind: 'rect', x: 55, y: 57, w: 12, h: 20 },
  ],
  triceps: [
    { kind: 'rect', x: 20, y: 54, w: 7, h: 18 },
    { kind: 'rect', x: 73, y: 54, w: 7, h: 18 },
  ],
  lower_back: [{ kind: 'rect', x: 44, y: 70, w: 12, h: 16 }],
  glutes: [
    { kind: 'ellipse', cx: 43, cy: 94, rx: 8, ry: 7 },
    { kind: 'ellipse', cx: 57, cy: 94, rx: 8, ry: 7 },
  ],
  abductors: [
    { kind: 'rect', x: 32, y: 92, w: 4, h: 12 },
    { kind: 'rect', x: 64, y: 92, w: 4, h: 12 },
  ],
  hamstrings: [
    { kind: 'rect', x: 35, y: 103, w: 10, h: 26 },
    { kind: 'rect', x: 55, y: 103, w: 10, h: 26 },
  ],
  calves: [
    { kind: 'rect', x: 36, y: 132, w: 8, h: 22 },
    { kind: 'rect', x: 56, y: 132, w: 8, h: 22 },
  ],
};

function Figure({
  regions,
  offset,
  byMuscle,
}: {
  regions: Record<string, Shape[]>;
  offset: number;
  byMuscle: Map<string, AnalyticsSummary['volume'][number]>;
}) {
  return (
    <g transform={`translate(${offset} 0)`}>
      {/* Silhueta */}
      <ellipse cx={50} cy={20} rx={10} ry={12} fill="var(--border)" />
      <rect x={30} y={34} width={40} height={58} rx={10} fill="var(--border)" />
      <rect x={15} y={40} width={14} height={56} rx={6} fill="var(--border)" />
      <rect x={71} y={40} width={14} height={56} rx={6} fill="var(--border)" />
      <rect x={32} y={88} width={36} height={70} rx={8} fill="var(--border)" />
      {Object.entries(regions).map(([muscle, shapes]) => {
        const v = byMuscle.get(muscle);
        const status = v?.status ?? 'none';
        const label = `${v?.namePt ?? muscle}: ${STATUS_LABELS[status]}`;
        return (
          <g key={muscle} fill={STATUS_FILL[status]}>
            <title>{label}</title>
            {shapes.map((s, i) =>
              s.kind === 'ellipse' ? (
                <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />
              ) : (
                <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={2} />
              ),
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Mapa corporal (P12.6): séries duras por semana × faixas, frente e costas. */
export function BodyMap({ volume }: { volume: AnalyticsSummary['volume'] }) {
  const byMuscle = new Map(volume.map((v) => [v.muscle, v]));
  return (
    <svg
      viewBox="0 0 210 162"
      className="mx-auto h-56 w-full max-w-sm"
      role="img"
      aria-label="Mapa corporal do volume semanal"
    >
      <Figure regions={FRONT} offset={0} byMuscle={byMuscle} />
      <Figure regions={BACK} offset={110} byMuscle={byMuscle} />
    </svg>
  );
}
