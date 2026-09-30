import { formatNumber } from '@/lib/format';

interface MacroRow {
  label: string;
  consumed: number;
  planned: number;
  target: number;
  unit: string;
}

/** Barra com três camadas: consumido (cheio), planejado (hachurado), restante (P7.3/P12.2). */
function Bar({ row }: { row: MacroRow }) {
  const pct = (v: number) => (row.target > 0 ? Math.min(100, (v / row.target) * 100) : 0);
  const consumedPct = pct(row.consumed);
  const plannedPct = Math.min(100 - consumedPct, pct(row.planned));
  const over = row.consumed > row.target;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{row.label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className={over ? 'font-semibold text-foreground' : 'text-foreground'}>
            {formatNumber(row.consumed)}
          </span>{' '}
          / {formatNumber(row.target)} {row.unit}
        </span>
      </div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={row.label}
        aria-valuemin={0}
        aria-valuemax={row.target}
        aria-valuenow={Math.round(row.consumed)}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${String(consumedPct)}%` }}
        />
        {plannedPct > 0 ? (
          <div
            className="h-full bg-[repeating-linear-gradient(45deg,var(--primary)_0,var(--primary)_2px,transparent_2px,transparent_5px)] opacity-60"
            style={{ width: `${String(plannedPct)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function MacroBars({ rows }: { rows: MacroRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Bar key={r.label} row={r} />
      ))}
    </div>
  );
}

/** Anel de kcal consumidas / meta. */
export function KcalRing({ consumed, target }: { consumed: number; target: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const frac = target > 0 ? Math.min(1, consumed / target) : 0;
  const remaining = Math.round(target - consumed);
  return (
    <div
      className="relative size-32 shrink-0"
      role="img"
      aria-label={`${formatNumber(consumed)} de ${formatNumber(target)} kcal`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${String(c * frac)} ${String(c)}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums">{formatNumber(consumed)}</span>
        <span className="text-xs text-muted-foreground">de {formatNumber(target)} kcal</span>
        <span className="text-[11px] text-muted-foreground">
          {remaining >= 0
            ? `faltam ${formatNumber(remaining)}`
            : `${formatNumber(-remaining)} acima`}
        </span>
      </div>
    </div>
  );
}
