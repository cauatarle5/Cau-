import { weekPlan, weekStart } from '@atlas/core';

import type { RecoveryRepository } from '../recovery/repository';
import type { TrainingRepository } from '../training/repository';

import type { RealDay, RealPlan } from './service';

/**
 * Plano real do intervalo (ADR-048): sessão feita ou treino agendado (não pulado) = academia;
 * sessão com RPE ≥ 8 ou agendado em semana de RIR 1 = treino pesado; atividades registradas.
 */
export function createRealPlanProvider(deps: {
  trainingRepo: TrainingRepository;
  recoveryRepo: RecoveryRepository;
}) {
  return async (userId: string, from: string, to: string): Promise<RealPlan> => {
    const [planned, sessions, acts] = await Promise.all([
      deps.trainingRepo.listPlanned(userId, { from, to }),
      deps.trainingRepo.sessionDays(userId, from, to),
      deps.recoveryRepo.listActivities(userId, from, to),
    ]);
    const days = new Map<string, RealDay>();
    const get = (date: string) => {
      let d = days.get(date);
      if (!d) {
        d = { gym: false, hardGym: false, gymMinutes: null, activities: [] };
        days.set(date, d);
      }
      return d;
    };
    const agendaWeeks = new Set<string>();
    const withSession = new Set(sessions.map((s) => s.date));
    for (const p of planned) {
      agendaWeeks.add(weekStart(p.planned.date));
      if (p.planned.status === 'skipped' || withSession.has(p.planned.date)) continue;
      const d = get(p.planned.date);
      d.gym = true;
      d.hardGym ||= weekPlan(p.planned.weekIndex).rir === 1;
    }
    for (const s of sessions) {
      const d = get(s.date);
      d.gym = true;
      d.hardGym ||= (s.rpe ?? 0) >= 8;
      if (s.minutes !== null) d.gymMinutes = (d.gymMinutes ?? 0) + s.minutes;
    }
    for (const a of acts) {
      get(a.date).activities.push({
        sportCode: a.sportCode,
        durationMin: a.durationMin,
        intensityRpe: a.intensityRpe,
      });
    }
    return { agendaWeeks, days };
  };
}
