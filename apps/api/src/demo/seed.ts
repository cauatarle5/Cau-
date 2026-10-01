import {
  addDays,
  dateRange,
  localDate,
  readiness,
  scaleNutrients,
  weekPlan,
  type Nutrients,
} from '@atlas/core';
import {
  activities,
  and,
  bodyMeasurements,
  dailyCheckins,
  eq,
  foodNutrients,
  foods,
  inArray,
  mealItems,
  meals,
  plannedWorkouts,
  sessionExercises,
  setLogs,
  users,
  workoutSessions,
  type Database,
} from '@atlas/db';

import { createServices } from '../services';

export const DEMO_EMAIL = 'demo@atlas.app';
export const DEMO_PASSWORD = 'demo-atlas-2026';
export const DEMO_TZ = 'America/Sao_Paulo';
const DAYS = 90;

/** Treino seg/ter/qui/sáb (último treino sempre a ≤ 2 dias), futebol na quarta. */
const GYM_WEEKDAYS = [1, 2, 4, 6];
const FOOTBALL_WEEKDAY = 3;
/** Pausa (férias) entre 59 e 50 dias atrás. */
const PAUSE = { from: 59, to: 50 };

/** Gerador pseudoaleatório determinístico (LCG). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-03:00`);

type MealPlan = {
  slot: 'breakfast' | 'lunch' | 'afternoon_snack' | 'dinner';
  items: [string, number][];
};

/** Cardápio base (~2150 kcal, ~170 g de proteína) com alimentos da TACO. */
const MENU: MealPlan[] = [
  {
    slot: 'breakfast',
    items: [
      ['Pão, trigo, francês', 100],
      ['Ovo, de galinha, inteiro, cozido/10minutos', 100],
      ['Café, infusão 10%', 200],
      ['Banana, prata, crua', 100],
    ],
  },
  {
    slot: 'lunch',
    items: [
      ['Arroz, tipo 1, cozido', 200],
      ['Feijão, carioca, cozido', 150],
      ['Frango, peito, sem pele, grelhado', 180],
    ],
  },
  {
    slot: 'afternoon_snack',
    items: [
      ['Iogurte, natural', 200],
      ['Aveia, flocos, crua', 40],
      ['Mamão, Papaia, cru', 150],
    ],
  },
  {
    slot: 'dinner',
    items: [
      ['Arroz, tipo 1, cozido', 150],
      ['Carne, bovina, patinho, sem gordura, grelhado', 150],
      ['Batata, inglesa, cozida', 200],
    ],
  },
];
const PROTEIN_FOODS = new Set([
  'Frango, peito, sem pele, grelhado',
  'Carne, bovina, patinho, sem gordura, grelhado',
  'Ovo, de galinha, inteiro, cozido/10minutos',
]);

/**
 * Cria (ou recria) o usuário demo com 90 dias determinísticos (P10.4, ADR-052): pesagens com
 * tendência de perda, refeições da TACO, programa com sessões e cargas progressivas, futebol,
 * check-ins e uma pausa. Montado para disparar insights conhecidos: recorde recente, um
 * exercício estagnado, proteína baixa em 3 dos últimos 5 dias de treino e sono × tonelagem.
 * Termina recalculando recordes, GET adaptativo e insights.
 */
export async function seedDemo(db: Database, opts: { today?: string } = {}) {
  const today = opts.today ?? localDate(new Date(), DEMO_TZ);
  const start = addDays(today, -(DAYS - 1));
  const svc = createServices(db);
  const random = rng(20260101);

  await db.delete(users).where(eq(users.email, DEMO_EMAIL));
  const issued = await svc.auth.register(
    { name: 'Demo Atlas', email: DEMO_EMAIL, password: DEMO_PASSWORD },
    { userAgent: 'seed-demo', ip: null },
  );
  const userId = issued.user.id;
  const ctx = { userId, timezone: DEMO_TZ, today };

  await svc.profile.putProfile(userId, {
    sex: 'male',
    birthDate: '1992-05-10',
    heightCm: 178,
    trainingExperience: 'intermediate',
    conditioningLevel: 3,
    activityLifestyle: 'light',
    aestheticPriorities: [],
    performancePriorities: [],
    clinicalCondition: false,
  });
  await svc.profile.createGoal(userId, { primaryGoal: 'fat_loss' }, start);
  await svc.profile.putAvailability(
    userId,
    GYM_WEEKDAYS.map((wd) => ({ weekday: wd, maxMinutes: 60, kind: 'gym' as const })),
  );
  await svc.profile.putSports(userId, [
    {
      sportCode: 'football',
      weeklyFrequency: 1,
      typicalDurationMin: 90,
      typicalIntensity: 4,
      weekdayHint: FOOTBALL_WEEKDAY,
    },
  ]);

  // Programa gerado pelo motor de regras e ativado hoje (agenda futura).
  const draft = await svc.agenda.generate(ctx, {});
  const program = await svc.training.createProgram(ctx, { ...draft.program, activate: true });
  const templates = [...program.templates].sort((a, b) => a.dayOrder - b.dayOrder);
  const exerciseIds = [...new Set(templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)))];
  const bundles = new Map(
    (await svc.exercises.bundles(userId, exerciseIds)).map((b) => [b.exercise.id, b]),
  );
  // Exercício que fica estagnado nas últimas 5 semanas: o primeiro com carga do primeiro treino.
  const stagnantId = templates[0]?.exercises.find(
    (e) => bundles.get(e.exerciseId)?.exercise.loadType === 'external',
  )?.exerciseId;

  // Pesagens: ~6 por semana, tendência de −0,5%/semana.
  const days = dateRange(start, today);
  const weighIns = days.flatMap((date, i) => {
    const noise = (random() - 0.5) * 0.8;
    if (i % 7 === 3 && date !== today) return [];
    return [
      {
        userId,
        date,
        measuredAt: at(date, '07:30'),
        weightKg: Math.round((85 - 0.06 * i + noise) * 10) / 10,
        ...(i === 0 ? { waistCm: 92, bodyFatPct: 22, bodyFatMethod: 'bioimpedance' as const } : {}),
        ...(date === today ? { waistCm: 88 } : {}),
      },
    ];
  });
  await db.insert(bodyMeasurements).values(weighIns);

  // Check-ins: sono variável; noites curtas (< 6 h) em ~30% dos dias, nunca nas últimas 2 semanas.
  const sleepByDate = new Map<string, number>();
  const checkins = days.flatMap((date, i) => {
    const r = random();
    const recent = i >= DAYS - 14;
    const short = !recent && r < 0.3;
    const sleepHours = short
      ? 5 + Math.round(random() * 2) / 4
      : 6.5 + Math.round(random() * 6) / 4;
    sleepByDate.set(date, sleepHours);
    if (random() < 0.12 && !recent) return [];
    const c = {
      sleepHours,
      sleepQuality: short ? 2 : 4,
      energy: short ? 2 : 4,
      stress: short ? 3 : 2,
      fatigue: short ? 4 : 2,
      soreness: 2,
    };
    return [{ userId, date, ...c, readinessScore: readiness(c).score }];
  });
  await db.insert(dailyCheckins).values(checkins);

  const inPause = (i: number) => DAYS - 1 - i <= PAUSE.from && DAYS - 1 - i >= PAUSE.to;

  // Futebol às quartas (fora da pausa).
  const footballDates = days.filter(
    (d, i) => weekday(d) === FOOTBALL_WEEKDAY && !inPause(i) && d < today,
  );
  await db.insert(activities).values(
    footballDates.map((date, k) => ({
      userId,
      date,
      startedAt: at(date, '20:00'),
      sportCode: 'football' as const,
      durationMin: 90,
      intensityRpe: k % 3 === 0 ? 8 : 7,
      lowerBodyDemand: 3,
    })),
  );

  // Treinos: agenda passada + sessões com carga progressiva. Noite curta: −2 reps e sem progressão.
  const state = new Map<string, { load: number; reps: number; exposures: number }>();
  const gymDates = days.filter((d, i) => GYM_WEEKDAYS.includes(weekday(d)) && d < today && i >= 0);
  const stagnantFrom = addDays(today, -35);
  let rotation = 0;
  for (const date of gymDates) {
    const i = days.indexOf(date);
    const tpl = templates[rotation % templates.length];
    rotation += 1;
    if (!tpl) continue;
    const weekIndex = Math.floor(i / 7) % 5;
    const skip = inPause(i);
    const missed = !skip && random() < 0.08;
    const [planned] = await db
      .insert(plannedWorkouts)
      .values({
        userId,
        date,
        workoutTemplateId: tpl.id,
        programId: program.id,
        templateName: tpl.name,
        weekIndex,
        status: skip ? 'skipped' : missed ? 'planned' : 'done',
      })
      .returning();
    if (skip || missed || !planned) continue;

    const short = (sleepByDate.get(date) ?? 8) < 6;
    const rir = weekPlan(weekIndex).rir;
    const startedAt = at(date, '18:00');
    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId,
        date,
        workoutTemplateId: tpl.id,
        plannedWorkoutId: planned.id,
        name: tpl.name,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 65 * 60_000),
        durationMin: 65,
        sessionRpe: rir <= 1 ? 8 : 7,
      })
      .returning();
    if (!session) continue;

    for (const [order, te] of tpl.exercises.entries()) {
      const b = bundles.get(te.exerciseId);
      const external = b?.exercise.loadType === 'external';
      const st = state.get(te.exerciseId) ?? {
        load: b?.exercise.mechanics === 'compound' ? 50 + order * 5 : 12 + order * 2,
        reps: Math.min(te.repMax, te.repMin + 1),
        exposures: 0,
      };
      const frozen = te.exerciseId === stagnantId && date >= stagnantFrom;
      const reps = Math.max(1, st.reps - (short ? 2 : 0));
      const [se] = await db
        .insert(sessionExercises)
        .values({
          sessionId: session.id,
          order,
          exerciseId: te.exerciseId,
          exerciseName: te.exerciseName,
          templateExerciseId: te.id,
          status: 'done',
          targetSets: te.sets,
          repMin: te.repMin,
          repMax: te.repMax,
          targetRir: rir,
          restSeconds: te.restSeconds,
        })
        .returning();
      if (!se) continue;
      await db.insert(setLogs).values(
        Array.from({ length: te.sets }, (_, k) => ({
          sessionExerciseId: se.id,
          setIndex: k,
          setType: 'working' as const,
          reps,
          loadKg: external ? st.load : null,
          rir: 2,
          completed: true,
          loggedAt: new Date(startedAt.getTime() + (order * 10 + k * 3) * 60_000),
        })),
      );
      // Progressão linear: +2,5 kg (compostos) ou +1 kg (isolados) por exposição normal.
      if (!short && !frozen) {
        st.exposures += 1;
        st.load += b?.exercise.mechanics === 'compound' ? 2.5 : 1;
      }
      state.set(te.exerciseId, st);
    }
  }
  await svc.training.rebuildRecords(userId, exerciseIds);

  // Refeições: 4 por dia com variação de porções; ~12% dos dias com só 2 refeições.
  const foodRows = await db
    .select({ id: foods.id, name: foods.namePt, n: foodNutrients })
    .from(foods)
    .innerJoin(foodNutrients, eq(foodNutrients.foodId, foods.id))
    .where(
      and(
        eq(foods.sourceCode, 'taco'),
        inArray(foods.namePt, [...new Set(MENU.flatMap((m) => m.items.map(([n]) => n)))]),
      ),
    );
  const byName = new Map(foodRows.map((f) => [f.name, f]));
  // Proteína baixa em 3 dos últimos 5 dias com treino (academia ou futebol).
  const trainedDates = days
    .filter((d, i) => d < today && !inPause(i))
    .filter((d) => GYM_WEEKDAYS.includes(weekday(d)) || weekday(d) === FOOTBALL_WEEKDAY)
    .slice(-5);
  const lowProtein = new Set([trainedDates[0], trainedDates[2], trainedDates[4]]);
  for (const [i, date] of days.entries()) {
    if (date === today) continue;
    const partial = random() < 0.12 && i < DAYS - 14;
    const plan = partial ? MENU.filter((m) => m.slot === 'lunch' || m.slot === 'dinner') : MENU;
    for (const meal of plan) {
      const [row] = await db
        .insert(meals)
        .values({
          userId,
          date,
          slot: meal.slot,
          status: 'logged',
          eatenAt: at(
            date,
            meal.slot === 'breakfast'
              ? '07:30'
              : meal.slot === 'lunch'
                ? '12:30'
                : meal.slot === 'dinner'
                  ? '20:30'
                  : '16:00',
          ),
        })
        .returning();
      if (!row) continue;
      const items = meal.items.flatMap(([name, baseGrams]) => {
        const f = byName.get(name);
        if (!f) return [];
        let grams = Math.round(baseGrams * (0.9 + random() * 0.2));
        if (lowProtein.has(date) && PROTEIN_FOODS.has(name)) grams = Math.round(grams * 0.45);
        const snapshot: Nutrients = scaleNutrients(f.n, grams);
        return [
          {
            mealId: row.id,
            foodId: f.id,
            foodName: name,
            quantity: grams,
            unitCode: 'g',
            grams,
            nutrientsSnapshot: snapshot,
          },
        ];
      });
      if (items.length > 0) await db.insert(mealItems).values(items);
    }
  }

  // GET adaptativo das últimas 5 semanas (histórico) e insights de hoje.
  for (let w = 4; w >= 0; w--) await svc.energy.refresh(userId, addDays(today, -7 * w));
  const insights = await svc.insights.refresh(userId, today);
  return {
    userId,
    email: DEMO_EMAIL,
    today,
    stagnantExerciseId: stagnantId ?? null,
    insights: insights.generated,
  };
}
