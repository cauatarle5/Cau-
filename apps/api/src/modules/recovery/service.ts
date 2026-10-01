import type { z } from 'zod';

import {
  addDays,
  loadSeries,
  readiness,
  sessionLoad,
  type PainRegion,
  type Readiness,
} from '@atlas/core';
import type { ActivityRow, DailyCheckinRow } from '@atlas/db';
import type {
  ActivityDto,
  CheckinDto,
  activityInputSchema,
  activityPatchSchema,
  checkinPutSchema,
  painReportInputSchema,
} from '@atlas/schemas';

import { notFound } from '../../lib/errors';
import type { ProfileService } from '../profile/service';

import type { RecoveryRepository } from './repository';

/** Esportes que contam como intensos para pernas com RPE ≥ 7 (ADR-045). */
const LEG_SPORTS = new Set(['football', 'futsal', 'running']);

export const isHardLowerBody = (
  a: Pick<ActivityRow, 'intensityRpe' | 'lowerBodyDemand' | 'sportCode'>,
) => a.intensityRpe >= 7 && (a.lowerBodyDemand === 3 || LEG_SPORTS.has(a.sportCode));

function toActivityDto(a: ActivityRow): ActivityDto {
  return {
    id: a.id,
    date: a.date,
    sportCode: a.sportCode,
    durationMin: a.durationMin,
    intensityRpe: a.intensityRpe,
    lowerBodyDemand: a.lowerBodyDemand,
    distanceKm: a.distanceKm,
    notes: a.notes,
    loadAU: sessionLoad(a.intensityRpe, a.durationMin),
  };
}

const checkinInput = (c: DailyCheckinRow) => ({
  sleepHours: c.sleepHours,
  sleepQuality: c.sleepQuality,
  energy: c.energy,
  stress: c.stress,
  fatigue: c.fatigue,
  soreness: c.soreness,
});

export function createRecoveryService(deps: {
  repo: RecoveryRepository;
  profile: ProfileService;
  /** Cargas sRPE das sessões de musculação (módulo de treino; ligação tardia). */
  sessionLoads: (
    userId: string,
    from: string,
    to: string,
  ) => Promise<{ date: string; au: number }[]>;
  /** Confirmam que a sessão e o exercício são do usuário (lançam 404), ADR-046. */
  assertSession: (userId: string, id: string) => Promise<void>;
  assertExercise: (userId: string, id: string) => Promise<void>;
}) {
  const { repo, profile, sessionLoads, assertSession, assertExercise } = deps;

  async function loadRange(userId: string, from: string, to: string) {
    // 56 dias antes alimentam a EWMA crônica (ADR-044).
    const start = addDays(from, -56);
    const [sessions, acts] = await Promise.all([
      sessionLoads(userId, start, to),
      repo.listActivities(userId, start, to),
    ]);
    const entries = [
      ...sessions,
      ...acts.map((a) => ({ date: a.date, au: sessionLoad(a.intensityRpe, a.durationMin) })),
    ];
    return loadSeries(entries, from, to);
  }

  /** Prontidão do dia; o ajuste de esporte de pernas vale só para sessão com pernas (P8.5). */
  async function readinessFor(
    userId: string,
    date: string,
    lowerBodySession: boolean,
  ): Promise<Readiness> {
    const [checkin, load, yesterday] = await Promise.all([
      repo.getCheckin(userId, date),
      loadRange(userId, date, date),
      // Só a atividade de ontem conta para o ajuste de −10 (P8.5, "últimas 24 h").
      repo.listActivities(userId, addDays(date, -1), addDays(date, -1)),
    ]);
    return readiness(checkin ? checkinInput(checkin) : null, {
      acwr: load[0]?.acwr ?? null,
      hardLowerBodyActivity24h: yesterday.some(isHardLowerBody),
      lowerBodySession,
    });
  }

  return {
    async listActivities(userId: string, from: string, to: string) {
      return (await repo.listActivities(userId, from, to)).map(toActivityDto);
    },

    async createActivity(userId: string, input: z.output<typeof activityInputSchema>) {
      return toActivityDto(
        await repo.createActivity(userId, {
          ...input,
          distanceKm: input.distanceKm ?? null,
          notes: input.notes ?? null,
        }),
      );
    },

    async updateActivity(userId: string, id: string, patch: z.output<typeof activityPatchSchema>) {
      const row = await repo.updateActivity(userId, id, patch);
      if (!row) throw notFound('Atividade');
      return toActivityDto(row);
    },

    async deleteActivity(userId: string, id: string) {
      if (!(await repo.deleteActivity(userId, id))) throw notFound('Atividade');
    },

    async getCheckin(userId: string, date: string): Promise<CheckinDto> {
      const row = await repo.getCheckin(userId, date);
      return {
        date,
        checkin: row
          ? {
              ...checkinInput(row),
              availableMinutes: row.availableMinutes,
              notes: row.notes,
            }
          : null,
        readiness: await readinessFor(userId, date, false),
      };
    },

    /** Salva o check-in e persiste a prontidão geral do dia (ADR-044). */
    async putCheckin(userId: string, date: string, input: z.output<typeof checkinPutSchema>) {
      const values = {
        ...input,
        availableMinutes: input.availableMinutes ?? null,
        notes: input.notes ?? null,
      };
      await repo.upsertCheckin(userId, date, values);
      const r = await readinessFor(userId, date, false);
      await repo.upsertCheckin(userId, date, { ...values, readinessScore: r.score });
      return this.getCheckin(userId, date);
    },

    async createPain(userId: string, input: z.output<typeof painReportInputSchema>) {
      if (input.sessionId) await assertSession(userId, input.sessionId);
      if (input.duringExerciseId) await assertExercise(userId, input.duringExerciseId);
      const row = await repo.createPain(userId, {
        ...input,
        sessionId: input.sessionId ?? null,
        duringExerciseId: input.duringExerciseId ?? null,
        notes: input.notes ?? null,
      });
      return {
        id: row.id,
        date: row.date,
        bodyRegion: row.bodyRegion,
        intensity: row.intensity,
        sessionId: row.sessionId,
        duringExerciseId: row.duringExerciseId,
        type: row.type,
        notes: row.notes,
        seeProfessional: row.intensity >= 7,
      };
    },

    loadRange,
    readinessFor,

    /**
     * Contexto da adaptação (ADR-045/046): esporte intenso ontem, esporte amanhã (agenda fixa
     * do perfil ou atividade registrada), dores dos últimos 7 dias (com recorrência em 3
     * sessões) e minutos disponíveis do check-in.
     */
    async adaptationContext(userId: string, date: string) {
      const [yesterday, tomorrow, pain, checkin, schedule] = await Promise.all([
        repo.listActivities(userId, addDays(date, -1), addDays(date, -1)),
        repo.listActivities(userId, addDays(date, 1), addDays(date, 1)),
        repo.listPain(userId, addDays(date, -28), date),
        repo.getCheckin(userId, date),
        profile.scheduleContext(userId),
      ]);
      const hard = yesterday
        .filter(isHardLowerBody)
        .sort((a, b) => b.intensityRpe - a.intensityRpe)[0];
      const tomorrowDow = new Date(`${addDays(date, 1)}T00:00:00Z`).getUTCDay();
      const fixed = schedule.sports.find((s) => s.weekday === tomorrowDow);
      const sportTomorrow = tomorrow[0]
        ? { sport: tomorrow[0].sportCode }
        : fixed
          ? { sport: fixed.sportCode }
          : schedule.sportDays.includes(tomorrowDow)
            ? { sport: 'other' }
            : null;
      const recent = pain.filter((p) => p.date >= addDays(date, -7));
      const byRegion = new Map<PainRegion, { intensity: number; sessions: Set<string> }>();
      for (const p of pain) {
        const entry = byRegion.get(p.bodyRegion) ?? { intensity: 0, sessions: new Set<string>() };
        if (p.sessionId) entry.sessions.add(p.sessionId);
        byRegion.set(p.bodyRegion, entry);
      }
      for (const p of recent) {
        const entry = byRegion.get(p.bodyRegion);
        if (entry) entry.intensity = Math.max(entry.intensity, p.intensity);
      }
      return {
        sportYesterday: hard ? { sport: hard.sportCode, rpe: hard.intensityRpe } : null,
        sportTomorrow,
        pain: [...byRegion.entries()]
          .filter(([, v]) => v.intensity > 0 || v.sessions.size >= 3)
          // Recorrente em 3 sessões conta como dor forte (ADR-046).
          .map(([region, v]) => ({
            region,
            intensity: v.sessions.size >= 3 ? Math.max(7, v.intensity) : v.intensity,
          })),
        availableMinutes: checkin?.availableMinutes ?? null,
      };
    },
  };
}

export type RecoveryService = ReturnType<typeof createRecoveryService>;
