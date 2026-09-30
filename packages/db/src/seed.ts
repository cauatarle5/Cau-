import type { Database } from './client';
import { equipment } from './schema';
import { seedExercises } from './seed-exercises';
import { seedFoods } from './seed-foods';

/** Equipamentos do catálogo (DATA_MODEL 4.3). */
export const EQUIPMENT_SEED: readonly { code: string; namePt: string }[] = [
  { code: 'barbell', namePt: 'Barra olímpica' },
  { code: 'dumbbell', namePt: 'Halteres' },
  { code: 'kettlebell', namePt: 'Kettlebell' },
  { code: 'bench', namePt: 'Banco' },
  { code: 'squat_rack', namePt: 'Rack / gaiola' },
  { code: 'smith_machine', namePt: 'Smith' },
  { code: 'cable', namePt: 'Polia / crossover' },
  { code: 'machine', namePt: 'Máquinas guiadas' },
  { code: 'leg_press', namePt: 'Leg press' },
  { code: 'pullup_bar', namePt: 'Barra fixa' },
  { code: 'dip_station', namePt: 'Paralelas' },
  { code: 'resistance_band', namePt: 'Elásticos' },
  { code: 'ez_bar', namePt: 'Barra W' },
  { code: 'treadmill', namePt: 'Esteira' },
  { code: 'bike', namePt: 'Bicicleta ergométrica' },
  { code: 'bodyweight', namePt: 'Peso corporal' },
];

/** Idempotente: insere o que falta e atualiza nomes. */
export async function seedCatalogs(db: Database): Promise<void> {
  for (const item of EQUIPMENT_SEED) {
    await db
      .insert(equipment)
      .values(item)
      .onConflictDoUpdate({ target: equipment.code, set: { namePt: item.namePt } });
  }
  await seedFoods(db);
  await seedExercises(db);
}
