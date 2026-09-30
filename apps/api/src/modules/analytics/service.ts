import { addDays, muscleVolume, volumeStatus, weekStart, type MuscleCode } from '@atlas/core';
import { muscleCodes, type MuscleVolumeDto } from '@atlas/schemas';

import type { ExercisesService } from '../exercises/service';
import type { ProfileService } from '../profile/service';
import type { TrainingService } from '../training/service';

export function createAnalyticsService(deps: {
  training: TrainingService;
  exercises: ExercisesService;
  profile: ProfileService;
}) {
  const { training, exercises, profile } = deps;
  return {
    /** Volume semanal (seg–dom) por músculo com faixas MEV/produtiva/MRV (P8.1/P8.2). */
    async muscleVolume(userId: string, today: string, start?: string): Promise<MuscleVolumeDto> {
      const from = weekStart(start ?? today);
      const to = addDays(from, 6);
      const [performed, names, ctx] = await Promise.all([
        training.performedInRange(userId, from, to),
        exercises.muscleNames(),
        profile.trainingContext(userId),
      ]);
      const byMuscle = new Map(muscleVolume(performed).map((v) => [v.muscle, v]));
      const items = muscleCodes.map((muscle: MuscleCode) => {
        const v = byMuscle.get(muscle);
        const hardSets = v?.hardSets ?? 0;
        return {
          muscle,
          namePt: names.get(muscle) ?? muscle,
          hardSets,
          frequency: v?.frequency ?? 0,
          ...volumeStatus(muscle, hardSets, { priority: ctx.priorities.has(muscle) }),
        };
      });
      return { weekStart: from, weekEnd: to, items };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
