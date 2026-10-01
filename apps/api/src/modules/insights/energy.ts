import { adaptiveTdee, addDays, weekStart } from '@atlas/core';
import type { EnergyEstimateRow } from '@atlas/db';
import type { EnergyEstimateDto, EnergyEstimates } from '@atlas/schemas';

import type { BodyService } from '../body/service';
import type { NutritionService } from '../nutrition/service';

import type { InsightsRepository } from './repository';

/** Estimativa mais antiga que isso não vale como GET em uso nem como base do limite (ADR-053). */
const STALE_DAYS = 21;

const toDto = (r: EnergyEstimateRow): EnergyEstimateDto => ({
  weekStart: r.weekStart,
  tdeeFormula: r.tdeeFormula,
  tdeeObserved: r.tdeeObserved,
  tdeeUsed: r.tdeeUsed,
  confidence: r.confidence,
  weightTrendKg: r.weightTrendKg,
  intakeAvgKcal: r.intakeAvgKcal,
  loggedDays: r.loggedDays,
  weighInCount: r.weighInCount,
});

/** A mais recente vale se tiver confiança média/alta e não estiver vencida. */
function inUse(row: EnergyEstimateRow | undefined, today: string) {
  if (!row || row.confidence === 'low') return null;
  return row.weekStart >= addDays(weekStart(today), -STALE_DAYS) ? row : null;
}

/** GET adaptativo semanal (P5.3, ADR-051). */
export function createEnergyService(deps: {
  repo: InsightsRepository;
  body: BodyService;
  nutrition: () => NutritionService;
}) {
  const { repo, body, nutrition } = deps;
  return {
    /**
     * Calcula a estimativa da semana de `today` com os 28 dias anteriores; idempotente por
     * (usuário, semana). `null` se as metas estão bloqueadas (perfil incompleto ou condição clínica).
     */
    async refresh(userId: string, today: string): Promise<EnergyEstimateDto | null> {
      const tdeeFormula = await nutrition().formulaTdee(userId, today);
      if (tdeeFormula === null) return null;
      const ws = weekStart(today);
      const from = addDays(today, -28);
      const to = addDays(today, -1);
      const [intake, trend, last] = await Promise.all([
        repo.dailyIntake(userId, from, to),
        body.trend(userId, from, to),
        repo.latestEstimate(userId, { before: ws }),
      ]);
      // Estimativa anterior antiga: o limite de ±150 kcal parte da fórmula.
      const previous = last && last.weekStart >= addDays(ws, -STALE_DAYS) ? last : undefined;
      const e = adaptiveTdee({
        days: intake.map((d) => ({ date: d.date, kcal: d.kcal, loggedMeals: d.loggedMeals })),
        trend: trend.points,
        tdeeFormula,
        previousTdee: previous?.tdeeUsed ?? null,
      });
      const row = await repo.upsertEstimate(userId, {
        weekStart: ws,
        ...e,
        inputs: { from, to, previousTdee: previous?.tdeeUsed ?? null },
      });
      return toDto(row);
    },

    async list(userId: string, today: string): Promise<EnergyEstimates> {
      const items = await repo.listEstimates(userId, 12);
      const current = inUse(items[0], today);
      return { current: current ? toDto(current) : null, items: items.map(toDto) };
    },

    /** GET em uso nas metas (ADR-051/053): a estimativa mais recente, se média/alta e recente. */
    async usable(userId: string, today: string) {
      const row = inUse(await repo.latestEstimate(userId), today);
      return row ? { kcal: row.tdeeUsed, confidence: row.confidence as 'medium' | 'high' } : null;
    },

    /** Já existe estimativa para a semana (recuperação do job, ADR-053). */
    hasWeek(userId: string, today: string) {
      return repo.hasEstimate(userId, weekStart(today));
    },
  };
}

export type EnergyService = ReturnType<typeof createEnergyService>;
