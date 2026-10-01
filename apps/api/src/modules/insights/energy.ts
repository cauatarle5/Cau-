import { adaptiveTdee, addDays, weekStart } from '@atlas/core';
import type { EnergyEstimateRow } from '@atlas/db';
import type { EnergyEstimateDto, EnergyEstimates } from '@atlas/schemas';

import type { BodyService } from '../body/service';
import type { NutritionService } from '../nutrition/service';

import type { InsightsRepository } from './repository';

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
      const [intake, trend, previous] = await Promise.all([
        repo.dailyIntake(userId, from, to),
        body.trend(userId, from, to),
        repo.latestEstimate(userId, { before: ws }),
      ]);
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

    async list(userId: string): Promise<EnergyEstimates> {
      const [items, current] = await Promise.all([
        repo.listEstimates(userId, 12),
        repo.latestEstimate(userId, { usable: true }),
      ]);
      return { current: current ? toDto(current) : null, items: items.map(toDto) };
    },

    /** GET em uso nas metas: a estimativa mais recente com confiança média ou alta. */
    async usable(userId: string) {
      const row = await repo.latestEstimate(userId, { usable: true });
      if (!row || row.confidence === 'low') return null;
      return { kcal: row.tdeeUsed, confidence: row.confidence };
    },
  };
}

export type EnergyService = ReturnType<typeof createEnergyService>;
