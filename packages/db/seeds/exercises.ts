import type { MuscleCode } from '@atlas/core';

/** Músculos (DATA_MODEL 4.3). */
export const MUSCLES: readonly {
  code: MuscleCode;
  namePt: string;
  group: 'push' | 'pull' | 'legs' | 'core';
  region: 'upper' | 'lower' | 'core';
}[] = [
  { code: 'chest', namePt: 'Peitoral', group: 'push', region: 'upper' },
  { code: 'front_delts', namePt: 'Deltoide anterior', group: 'push', region: 'upper' },
  { code: 'side_delts', namePt: 'Deltoide lateral', group: 'push', region: 'upper' },
  { code: 'rear_delts', namePt: 'Deltoide posterior', group: 'pull', region: 'upper' },
  { code: 'lats', namePt: 'Latíssimo do dorso', group: 'pull', region: 'upper' },
  {
    code: 'upper_back',
    namePt: 'Costas (romboides e trapézio médio)',
    group: 'pull',
    region: 'upper',
  },
  { code: 'traps', namePt: 'Trapézio superior', group: 'pull', region: 'upper' },
  { code: 'biceps', namePt: 'Bíceps', group: 'pull', region: 'upper' },
  { code: 'triceps', namePt: 'Tríceps', group: 'push', region: 'upper' },
  { code: 'forearms', namePt: 'Antebraço', group: 'pull', region: 'upper' },
  { code: 'abs', namePt: 'Abdômen', group: 'core', region: 'core' },
  { code: 'obliques', namePt: 'Oblíquos', group: 'core', region: 'core' },
  { code: 'lower_back', namePt: 'Lombar', group: 'core', region: 'core' },
  { code: 'glutes', namePt: 'Glúteos', group: 'legs', region: 'lower' },
  { code: 'quads', namePt: 'Quadríceps', group: 'legs', region: 'lower' },
  { code: 'hamstrings', namePt: 'Posteriores de coxa', group: 'legs', region: 'lower' },
  { code: 'adductors', namePt: 'Adutores', group: 'legs', region: 'lower' },
  { code: 'abductors', namePt: 'Abdutores', group: 'legs', region: 'lower' },
  { code: 'calves', namePt: 'Panturrilhas', group: 'legs', region: 'lower' },
];

export type Pattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'isolation_upper'
  | 'isolation_lower'
  | 'core'
  | 'carry'
  | 'cardio';

export interface ExerciseSeed {
  namePt: string;
  aliases: string[];
  pattern: Pattern;
  mechanics: 'compound' | 'isolation';
  laterality: 'bilateral' | 'unilateral';
  equipment: string[];
  loadType: 'external' | 'bodyweight' | 'assisted' | 'time';
  primary: MuscleCode[];
  secondary: MuscleCode[];
  contraindications: string[];
  incrementKg: number;
}

const LOWER: Pattern[] = ['squat', 'hinge', 'lunge'];

/** Compacto: nome, padrão, equipamentos, primários, secundários, opções. */
function e(
  namePt: string,
  pattern: Pattern,
  equipment: string[],
  primary: MuscleCode[],
  secondary: MuscleCode[] = [],
  opts: Partial<
    Pick<
      ExerciseSeed,
      'aliases' | 'mechanics' | 'laterality' | 'loadType' | 'contraindications' | 'incrementKg'
    >
  > = {},
): ExerciseSeed {
  const mechanics =
    opts.mechanics ??
    (pattern.startsWith('isolation') || pattern === 'core' ? 'isolation' : 'compound');
  const loadType =
    opts.loadType ??
    (equipment.every((q) => q === 'bodyweight' || q === 'pullup_bar' || q === 'dip_station')
      ? 'bodyweight'
      : 'external');
  // Incremento padrão (P8.3): 2,5 compostos superiores, 5 compostos inferiores, 1 isolados.
  const incrementKg =
    opts.incrementKg ??
    (loadType !== 'external'
      ? 0
      : mechanics === 'isolation'
        ? 1
        : LOWER.includes(pattern)
          ? 5
          : 2.5);
  return {
    namePt,
    aliases: opts.aliases ?? [],
    pattern,
    mechanics,
    laterality: opts.laterality ?? 'bilateral',
    equipment,
    loadType,
    primary,
    secondary,
    contraindications: opts.contraindications ?? [],
    incrementKg,
  };
}

const uni = { laterality: 'unilateral' as const };

export const EXERCISES: readonly ExerciseSeed[] = [
  // Empurrar horizontal
  e(
    'Supino reto com barra',
    'horizontal_push',
    ['barbell', 'bench'],
    ['chest'],
    ['triceps', 'front_delts'],
    { aliases: ['supino', 'supino reto', 'bench press'] },
  ),
  e(
    'Supino inclinado com barra',
    'horizontal_push',
    ['barbell', 'bench'],
    ['chest', 'front_delts'],
    ['triceps'],
    { aliases: ['supino inclinado'] },
  ),
  e('Supino declinado com barra', 'horizontal_push', ['barbell', 'bench'], ['chest'], ['triceps']),
  e(
    'Supino reto com halteres',
    'horizontal_push',
    ['dumbbell', 'bench'],
    ['chest'],
    ['triceps', 'front_delts'],
    { aliases: ['supino halteres'] },
  ),
  e(
    'Supino inclinado com halteres',
    'horizontal_push',
    ['dumbbell', 'bench'],
    ['chest', 'front_delts'],
    ['triceps'],
  ),
  e(
    'Supino no Smith',
    'horizontal_push',
    ['smith_machine', 'bench'],
    ['chest'],
    ['triceps', 'front_delts'],
  ),
  e(
    'Supino inclinado no Smith',
    'horizontal_push',
    ['smith_machine', 'bench'],
    ['chest', 'front_delts'],
    ['triceps'],
  ),
  e('Supino máquina', 'horizontal_push', ['machine'], ['chest'], ['triceps', 'front_delts'], {
    aliases: ['chest press'],
  }),
  e(
    'Supino fechado',
    'horizontal_push',
    ['barbell', 'bench'],
    ['triceps', 'chest'],
    ['front_delts'],
    { aliases: ['supino pegada fechada'] },
  ),
  e(
    'Flexão de braço',
    'horizontal_push',
    ['bodyweight'],
    ['chest'],
    ['triceps', 'front_delts', 'abs'],
    { aliases: ['flexão', 'push up'], contraindications: ['wrist_extension'] },
  ),
  e(
    'Flexão com pés elevados',
    'horizontal_push',
    ['bodyweight'],
    ['chest', 'front_delts'],
    ['triceps'],
    { contraindications: ['wrist_extension'] },
  ),
  e(
    'Mergulho nas paralelas',
    'horizontal_push',
    ['dip_station'],
    ['chest', 'triceps'],
    ['front_delts'],
    { aliases: ['paralelas', 'dips'], contraindications: ['shoulder_extension'] },
  ),
  e(
    'Crucifixo com halteres',
    'isolation_upper',
    ['dumbbell', 'bench'],
    ['chest'],
    ['front_delts'],
    { aliases: ['crucifixo'] },
  ),
  e(
    'Crucifixo inclinado com halteres',
    'isolation_upper',
    ['dumbbell', 'bench'],
    ['chest'],
    ['front_delts'],
  ),
  e('Crucifixo na máquina', 'isolation_upper', ['machine'], ['chest'], [], {
    aliases: ['peck deck', 'voador'],
  }),
  e('Crossover polia alta', 'isolation_upper', ['cable'], ['chest'], ['front_delts'], {
    aliases: ['crossover'],
  }),
  e('Crossover polia baixa', 'isolation_upper', ['cable'], ['chest'], ['front_delts']),
  // Empurrar vertical
  e(
    'Desenvolvimento com barra',
    'vertical_push',
    ['barbell'],
    ['front_delts'],
    ['triceps', 'side_delts'],
    {
      aliases: ['desenvolvimento militar', 'overhead press'],
      contraindications: ['overhead_press'],
    },
  ),
  e(
    'Desenvolvimento com halteres',
    'vertical_push',
    ['dumbbell', 'bench'],
    ['front_delts'],
    ['triceps', 'side_delts'],
    { aliases: ['desenvolvimento'], contraindications: ['overhead_press'] },
  ),
  e(
    'Desenvolvimento no Smith',
    'vertical_push',
    ['smith_machine', 'bench'],
    ['front_delts'],
    ['triceps', 'side_delts'],
    { contraindications: ['overhead_press'] },
  ),
  e(
    'Desenvolvimento máquina',
    'vertical_push',
    ['machine'],
    ['front_delts'],
    ['triceps', 'side_delts'],
    { contraindications: ['overhead_press'] },
  ),
  e(
    'Desenvolvimento Arnold',
    'vertical_push',
    ['dumbbell', 'bench'],
    ['front_delts', 'side_delts'],
    ['triceps'],
    { contraindications: ['overhead_press'] },
  ),
  e('Pike push-up', 'vertical_push', ['bodyweight'], ['front_delts'], ['triceps'], {
    contraindications: ['overhead_press', 'wrist_extension'],
  }),
  e('Landmine press', 'vertical_push', ['barbell'], ['front_delts', 'chest'], ['triceps'], uni),
  // Ombros isolados
  e('Elevação lateral com halteres', 'isolation_upper', ['dumbbell'], ['side_delts'], ['traps'], {
    aliases: ['elevação lateral'],
  }),
  e('Elevação lateral na polia', 'isolation_upper', ['cable'], ['side_delts'], [], uni),
  e('Elevação lateral na máquina', 'isolation_upper', ['machine'], ['side_delts'], []),
  e('Elevação frontal com halteres', 'isolation_upper', ['dumbbell'], ['front_delts'], [], {
    aliases: ['elevação frontal'],
  }),
  e('Elevação frontal na polia', 'isolation_upper', ['cable'], ['front_delts'], []),
  e(
    'Crucifixo inverso com halteres',
    'isolation_upper',
    ['dumbbell'],
    ['rear_delts'],
    ['upper_back'],
    { aliases: ['crucifixo inverso'] },
  ),
  e(
    'Crucifixo inverso na máquina',
    'isolation_upper',
    ['machine'],
    ['rear_delts'],
    ['upper_back'],
    { aliases: ['voador inverso'] },
  ),
  e('Face pull', 'isolation_upper', ['cable'], ['rear_delts', 'upper_back'], ['traps']),
  e('Remada alta', 'isolation_upper', ['barbell'], ['side_delts', 'traps'], ['biceps'], {
    contraindications: ['shoulder_impingement'],
  }),
  e('Encolhimento com halteres', 'isolation_upper', ['dumbbell'], ['traps'], ['forearms'], {
    aliases: ['encolhimento'],
  }),
  e('Encolhimento com barra', 'isolation_upper', ['barbell'], ['traps'], ['forearms']),
  // Puxar vertical
  e('Barra fixa pronada', 'vertical_pull', ['pullup_bar'], ['lats'], ['biceps', 'upper_back'], {
    aliases: ['barra fixa', 'pull up'],
  }),
  e('Barra fixa supinada', 'vertical_pull', ['pullup_bar'], ['lats', 'biceps'], ['upper_back'], {
    aliases: ['chin up'],
  }),
  e('Barra fixa assistida', 'vertical_pull', ['machine'], ['lats'], ['biceps', 'upper_back'], {
    loadType: 'assisted',
    incrementKg: 2.5,
  }),
  e('Puxada frontal aberta', 'vertical_pull', ['cable'], ['lats'], ['biceps', 'upper_back'], {
    aliases: ['puxada frente', 'puxada alta', 'pulldown'],
  }),
  e('Puxada frontal fechada', 'vertical_pull', ['cable'], ['lats'], ['biceps']),
  e('Puxada supinada', 'vertical_pull', ['cable'], ['lats', 'biceps'], ['upper_back']),
  e('Puxada unilateral na polia', 'vertical_pull', ['cable'], ['lats'], ['biceps'], uni),
  e('Pulldown braços estendidos', 'isolation_upper', ['cable'], ['lats'], ['triceps'], {
    aliases: ['pullover na polia'],
  }),
  e(
    'Pullover com halter',
    'isolation_upper',
    ['dumbbell', 'bench'],
    ['lats', 'chest'],
    ['triceps'],
  ),
  e('Puxada na máquina', 'vertical_pull', ['machine'], ['lats'], ['biceps', 'upper_back']),
  // Puxar horizontal
  e(
    'Remada curvada com barra',
    'horizontal_pull',
    ['barbell'],
    ['upper_back', 'lats'],
    ['biceps', 'rear_delts', 'lower_back'],
    { aliases: ['remada curvada'], contraindications: ['spinal_loading'] },
  ),
  e(
    'Remada curvada supinada',
    'horizontal_pull',
    ['barbell'],
    ['lats', 'upper_back'],
    ['biceps', 'lower_back'],
    { contraindications: ['spinal_loading'] },
  ),
  e(
    'Remada unilateral com halter',
    'horizontal_pull',
    ['dumbbell', 'bench'],
    ['lats', 'upper_back'],
    ['biceps', 'rear_delts'],
    { ...uni, aliases: ['serrote', 'remada serrote'] },
  ),
  e(
    'Remada baixa na polia',
    'horizontal_pull',
    ['cable'],
    ['upper_back', 'lats'],
    ['biceps', 'rear_delts'],
    { aliases: ['remada sentada', 'remada baixa'] },
  ),
  e(
    'Remada cavalinho',
    'horizontal_pull',
    ['barbell'],
    ['upper_back', 'lats'],
    ['biceps', 'lower_back'],
    { aliases: ['remada t'] },
  ),
  e(
    'Remada máquina',
    'horizontal_pull',
    ['machine'],
    ['upper_back', 'lats'],
    ['biceps', 'rear_delts'],
  ),
  e(
    'Remada apoiada no banco',
    'horizontal_pull',
    ['dumbbell', 'bench'],
    ['upper_back', 'lats'],
    ['biceps', 'rear_delts'],
    { aliases: ['remada no banco inclinado'] },
  ),
  e(
    'Remada invertida',
    'horizontal_pull',
    ['bodyweight', 'squat_rack'],
    ['upper_back', 'lats'],
    ['biceps'],
    { loadType: 'bodyweight', incrementKg: 0 },
  ),
  e(
    'Remada Pendlay',
    'horizontal_pull',
    ['barbell'],
    ['upper_back', 'lats'],
    ['biceps', 'lower_back'],
    { contraindications: ['spinal_loading'] },
  ),
  e('Remada no Smith', 'horizontal_pull', ['smith_machine'], ['upper_back', 'lats'], ['biceps']),
  // Bíceps
  e('Rosca direta com barra', 'isolation_upper', ['barbell'], ['biceps'], ['forearms'], {
    aliases: ['rosca direta'],
  }),
  e('Rosca direta barra W', 'isolation_upper', ['ez_bar'], ['biceps'], ['forearms'], {
    aliases: ['rosca w'],
  }),
  e('Rosca alternada com halteres', 'isolation_upper', ['dumbbell'], ['biceps'], ['forearms'], {
    ...uni,
    aliases: ['rosca alternada'],
  }),
  e('Rosca martelo', 'isolation_upper', ['dumbbell'], ['biceps', 'forearms'], [], {
    aliases: ['martelo'],
  }),
  e('Rosca concentrada', 'isolation_upper', ['dumbbell'], ['biceps'], [], uni),
  e('Rosca Scott', 'isolation_upper', ['ez_bar', 'bench'], ['biceps'], ['forearms'], {
    aliases: ['rosca scott'],
  }),
  e('Rosca Scott máquina', 'isolation_upper', ['machine'], ['biceps'], []),
  e('Rosca na polia', 'isolation_upper', ['cable'], ['biceps'], ['forearms']),
  e('Rosca inclinada com halteres', 'isolation_upper', ['dumbbell', 'bench'], ['biceps'], []),
  e('Rosca inversa', 'isolation_upper', ['ez_bar'], ['forearms', 'biceps'], []),
  e('Rosca punho', 'isolation_upper', ['barbell'], ['forearms'], [], {
    aliases: ['flexão de punho'],
  }),
  // Tríceps
  e('Tríceps na polia com barra', 'isolation_upper', ['cable'], ['triceps'], [], {
    aliases: ['tríceps pulley', 'tríceps polia'],
  }),
  e('Tríceps na polia com corda', 'isolation_upper', ['cable'], ['triceps'], [], {
    aliases: ['tríceps corda'],
  }),
  e('Tríceps francês com halter', 'isolation_upper', ['dumbbell'], ['triceps'], [], {
    aliases: ['tríceps francês'],
    contraindications: ['overhead_press'],
  }),
  e('Tríceps testa', 'isolation_upper', ['ez_bar', 'bench'], ['triceps'], [], {
    aliases: ['testa'],
  }),
  e('Tríceps coice', 'isolation_upper', ['dumbbell'], ['triceps'], [], {
    ...uni,
    aliases: ['coice'],
  }),
  e('Tríceps acima da cabeça na polia', 'isolation_upper', ['cable'], ['triceps'], [], {
    contraindications: ['overhead_press'],
  }),
  e('Tríceps unilateral na polia', 'isolation_upper', ['cable'], ['triceps'], [], uni),
  e('Mergulho no banco', 'isolation_upper', ['bench'], ['triceps'], ['chest', 'front_delts'], {
    loadType: 'bodyweight',
    incrementKg: 0,
    contraindications: ['shoulder_extension'],
  }),
  e('Tríceps máquina', 'isolation_upper', ['machine'], ['triceps'], []),
  // Agachamento
  e(
    'Agachamento livre',
    'squat',
    ['barbell', 'squat_rack'],
    ['quads', 'glutes'],
    ['adductors', 'lower_back'],
    {
      aliases: ['agachamento', 'back squat'],
      contraindications: ['deep_knee_flexion', 'spinal_loading'],
    },
  ),
  e('Agachamento frontal', 'squat', ['barbell', 'squat_rack'], ['quads'], ['glutes', 'abs'], {
    contraindications: ['deep_knee_flexion'],
  }),
  e('Agachamento no Smith', 'squat', ['smith_machine'], ['quads', 'glutes'], ['adductors'], {
    contraindications: ['deep_knee_flexion'],
  }),
  e('Agachamento goblet', 'squat', ['dumbbell'], ['quads', 'glutes'], ['adductors', 'abs'], {
    aliases: ['goblet squat'],
    contraindications: ['deep_knee_flexion'],
  }),
  e('Agachamento hack', 'squat', ['machine'], ['quads'], ['glutes'], {
    aliases: ['hack'],
    contraindications: ['deep_knee_flexion'],
  }),
  e('Leg press 45', 'squat', ['leg_press'], ['quads', 'glutes'], ['adductors'], {
    aliases: ['leg press', 'leg 45'],
    contraindications: ['deep_knee_flexion'],
  }),
  e('Leg press horizontal', 'squat', ['leg_press'], ['quads', 'glutes'], [], {
    contraindications: ['deep_knee_flexion'],
  }),
  e('Agachamento sumô com halter', 'squat', ['dumbbell'], ['adductors', 'glutes', 'quads'], [], {
    aliases: ['agachamento sumô'],
  }),
  e('Agachamento pistol', 'squat', ['bodyweight'], ['quads', 'glutes'], ['abs'], {
    ...uni,
    contraindications: ['deep_knee_flexion'],
  }),
  e('Agachamento com peso corporal', 'squat', ['bodyweight'], ['quads', 'glutes'], [], {
    aliases: ['agachamento livre sem peso'],
  }),
  e('Agachamento com salto', 'squat', ['bodyweight'], ['quads', 'glutes'], ['calves'], {
    contraindications: ['high_impact'],
  }),
  e('Cadeira extensora', 'isolation_lower', ['machine'], ['quads'], [], { aliases: ['extensora'] }),
  e('Sissy squat', 'isolation_lower', ['bodyweight'], ['quads'], [], {
    contraindications: ['deep_knee_flexion'],
  }),
  // Avanço / unilateral
  e(
    'Avanço com halteres',
    'lunge',
    ['dumbbell'],
    ['quads', 'glutes'],
    ['hamstrings', 'adductors'],
    { ...uni, aliases: ['avanço', 'afundo'], contraindications: ['deep_knee_flexion'] },
  ),
  e('Afundo búlgaro', 'lunge', ['dumbbell', 'bench'], ['quads', 'glutes'], ['adductors'], {
    ...uni,
    aliases: ['búlgaro', 'agachamento búlgaro'],
    contraindications: ['deep_knee_flexion'],
  }),
  e('Passada caminhando', 'lunge', ['dumbbell'], ['quads', 'glutes'], ['hamstrings'], {
    ...uni,
    aliases: ['passada'],
    contraindications: ['deep_knee_flexion'],
  }),
  e('Avanço reverso', 'lunge', ['dumbbell'], ['glutes', 'quads'], ['hamstrings'], uni),
  e('Subida no banco', 'lunge', ['dumbbell', 'bench'], ['quads', 'glutes'], [], {
    ...uni,
    aliases: ['step up'],
  }),
  e('Afundo no Smith', 'lunge', ['smith_machine'], ['quads', 'glutes'], [], {
    ...uni,
    contraindications: ['deep_knee_flexion'],
  }),
  e('Avanço com barra', 'lunge', ['barbell', 'squat_rack'], ['quads', 'glutes'], ['hamstrings'], {
    ...uni,
    contraindications: ['deep_knee_flexion', 'spinal_loading'],
  }),
  e('Avanço lateral', 'lunge', ['dumbbell'], ['adductors', 'glutes', 'quads'], [], uni),
  // Dobradiça de quadril
  e(
    'Levantamento terra',
    'hinge',
    ['barbell'],
    ['hamstrings', 'glutes', 'lower_back'],
    ['upper_back', 'traps', 'forearms'],
    { aliases: ['terra', 'deadlift'], contraindications: ['spinal_loading', 'heavy_hinge'] },
  ),
  e('Levantamento terra romeno', 'hinge', ['barbell'], ['hamstrings', 'glutes'], ['lower_back'], {
    aliases: ['stiff', 'terra romeno', 'rdl'],
    contraindications: ['heavy_hinge'],
  }),
  e('Stiff com halteres', 'hinge', ['dumbbell'], ['hamstrings', 'glutes'], ['lower_back'], {
    contraindications: ['heavy_hinge'],
  }),
  e(
    'Terra sumô',
    'hinge',
    ['barbell'],
    ['glutes', 'adductors', 'hamstrings'],
    ['lower_back', 'quads'],
    { contraindications: ['spinal_loading', 'heavy_hinge'] },
  ),
  e(
    'Terra com trap bar',
    'hinge',
    ['barbell'],
    ['quads', 'glutes', 'hamstrings'],
    ['traps', 'lower_back'],
    { contraindications: ['heavy_hinge'] },
  ),
  e(
    'Levantamento terra unilateral com halter',
    'hinge',
    ['dumbbell'],
    ['hamstrings', 'glutes'],
    ['lower_back'],
    uni,
  ),
  e('Good morning', 'hinge', ['barbell', 'squat_rack'], ['hamstrings', 'lower_back'], ['glutes'], {
    contraindications: ['spinal_loading', 'heavy_hinge'],
  }),
  e('Elevação pélvica com barra', 'hinge', ['barbell', 'bench'], ['glutes'], ['hamstrings'], {
    aliases: ['hip thrust', 'elevação de quadril'],
  }),
  e('Elevação pélvica na máquina', 'hinge', ['machine'], ['glutes'], ['hamstrings']),
  e('Ponte de glúteo', 'hinge', ['bodyweight'], ['glutes'], ['hamstrings'], { aliases: ['ponte'] }),
  e('Kettlebell swing', 'hinge', ['kettlebell'], ['glutes', 'hamstrings'], ['lower_back', 'abs'], {
    aliases: ['swing'],
  }),
  e('Hiperextensão lombar', 'hinge', ['bench'], ['lower_back', 'glutes'], ['hamstrings'], {
    aliases: ['extensão lombar', 'banco romano'],
    loadType: 'bodyweight',
    incrementKg: 0,
  }),
  e('Pull through na polia', 'hinge', ['cable'], ['glutes', 'hamstrings'], []),
  // Posteriores e glúteos isolados
  e('Mesa flexora', 'isolation_lower', ['machine'], ['hamstrings'], ['calves'], {
    aliases: ['flexora deitada', 'mesa flexora'],
  }),
  e('Cadeira flexora', 'isolation_lower', ['machine'], ['hamstrings'], [], {
    aliases: ['flexora sentada'],
  }),
  e('Flexora em pé', 'isolation_lower', ['machine'], ['hamstrings'], [], uni),
  e('Flexão nórdica', 'isolation_lower', ['bodyweight'], ['hamstrings'], [], {
    aliases: ['nordic curl'],
  }),
  e('Coice na polia', 'isolation_lower', ['cable'], ['glutes'], ['hamstrings'], {
    ...uni,
    aliases: ['glúteo na polia'],
  }),
  e('Glúteo na máquina', 'isolation_lower', ['machine'], ['glutes'], [], uni),
  e('Cadeira abdutora', 'isolation_lower', ['machine'], ['abductors', 'glutes'], [], {
    aliases: ['abdutora'],
  }),
  e('Cadeira adutora', 'isolation_lower', ['machine'], ['adductors'], [], { aliases: ['adutora'] }),
  e('Abdução com elástico', 'isolation_lower', ['resistance_band'], ['abductors', 'glutes'], []),
  e('Abdução na polia', 'isolation_lower', ['cable'], ['abductors', 'glutes'], [], uni),
  // Panturrilha
  e('Panturrilha em pé na máquina', 'isolation_lower', ['machine'], ['calves'], [], {
    aliases: ['panturrilha em pé', 'gêmeos'],
  }),
  e('Panturrilha sentado', 'isolation_lower', ['machine'], ['calves'], [], { aliases: ['sóleo'] }),
  e('Panturrilha no leg press', 'isolation_lower', ['leg_press'], ['calves'], []),
  e('Panturrilha no Smith', 'isolation_lower', ['smith_machine'], ['calves'], []),
  e('Panturrilha unilateral com halter', 'isolation_lower', ['dumbbell'], ['calves'], [], uni),
  e('Panturrilha no degrau', 'isolation_lower', ['bodyweight'], ['calves'], []),
  // Core
  e('Prancha', 'core', ['bodyweight'], ['abs'], ['obliques'], {
    loadType: 'time',
    aliases: ['prancha frontal'],
  }),
  e('Prancha lateral', 'core', ['bodyweight'], ['obliques'], ['abs'], { loadType: 'time', ...uni }),
  e('Abdominal supra', 'core', ['bodyweight'], ['abs'], [], { aliases: ['abdominal', 'crunch'] }),
  e('Abdominal na polia', 'core', ['cable'], ['abs'], [], {
    aliases: ['abdominal ajoelhado na polia'],
    incrementKg: 2.5,
  }),
  e('Abdominal na máquina', 'core', ['machine'], ['abs'], [], { incrementKg: 2.5 }),
  e('Elevação de pernas suspenso', 'core', ['pullup_bar'], ['abs'], ['obliques'], {
    aliases: ['elevação de pernas na barra'],
  }),
  e('Elevação de pernas deitado', 'core', ['bodyweight'], ['abs'], []),
  e('Abdominal infra no banco', 'core', ['bench'], ['abs'], [], {
    loadType: 'bodyweight',
    incrementKg: 0,
  }),
  e('Roda abdominal', 'core', ['bodyweight'], ['abs'], ['lats'], { aliases: ['ab wheel'] }),
  e('Pallof press', 'core', ['cable'], ['obliques', 'abs'], [], { ...uni, incrementKg: 1 }),
  e('Rotação na polia', 'core', ['cable'], ['obliques'], ['abs'], {
    ...uni,
    aliases: ['woodchopper'],
    incrementKg: 1,
  }),
  e('Abdominal bicicleta', 'core', ['bodyweight'], ['abs', 'obliques'], []),
  e('Dead bug', 'core', ['bodyweight'], ['abs'], []),
  e('Hollow hold', 'core', ['bodyweight'], ['abs'], [], { loadType: 'time' }),
  e('Russian twist', 'core', ['bodyweight'], ['obliques'], ['abs']),
  e('Bird dog', 'core', ['bodyweight'], ['lower_back', 'abs'], ['glutes']),
  // Carregamentos
  e('Caminhada do fazendeiro', 'carry', ['dumbbell'], ['forearms', 'traps'], ['abs', 'obliques'], {
    aliases: ['farmer walk'],
    incrementKg: 2.5,
  }),
  e('Caminhada com peso unilateral', 'carry', ['kettlebell'], ['obliques', 'forearms'], ['traps'], {
    ...uni,
    aliases: ['suitcase carry'],
    incrementKg: 2,
  }),
  // Cardio
  e('Esteira', 'cardio', ['treadmill'], ['quads'], ['calves', 'hamstrings'], {
    loadType: 'time',
    aliases: ['corrida na esteira', 'caminhada na esteira'],
  }),
  e('Bicicleta ergométrica', 'cardio', ['bike'], ['quads'], ['hamstrings', 'calves'], {
    loadType: 'time',
    aliases: ['bike'],
  }),
  e('Pular corda', 'cardio', ['bodyweight'], ['calves'], ['quads'], {
    loadType: 'time',
    contraindications: ['high_impact'],
  }),
  e('Burpee', 'cardio', ['bodyweight'], ['quads', 'chest'], ['abs', 'glutes'], {
    loadType: 'bodyweight',
    contraindications: ['high_impact', 'wrist_extension'],
  }),
  e('Polichinelo', 'cardio', ['bodyweight'], ['calves'], ['side_delts'], {
    loadType: 'time',
    contraindications: ['high_impact'],
  }),
  e(
    'Kettlebell clean',
    'hinge',
    ['kettlebell'],
    ['glutes', 'hamstrings'],
    ['traps', 'forearms'],
    uni,
  ),
  e('Kettlebell goblet squat', 'squat', ['kettlebell'], ['quads', 'glutes'], ['abs'], {
    contraindications: ['deep_knee_flexion'],
  }),
  e('Supino com kettlebell no chão', 'horizontal_push', ['kettlebell'], ['chest'], ['triceps']),
  e(
    'Remada com kettlebell',
    'horizontal_pull',
    ['kettlebell'],
    ['lats', 'upper_back'],
    ['biceps'],
    uni,
  ),
  e(
    'Desenvolvimento com kettlebell',
    'vertical_push',
    ['kettlebell'],
    ['front_delts'],
    ['triceps'],
    { ...uni, contraindications: ['overhead_press'] },
  ),
  e(
    'Remada com elástico',
    'horizontal_pull',
    ['resistance_band'],
    ['upper_back', 'lats'],
    ['biceps'],
    { incrementKg: 0 },
  ),
  e('Supino com elástico', 'horizontal_push', ['resistance_band'], ['chest'], ['triceps'], {
    incrementKg: 0,
  }),
  e('Rosca com elástico', 'isolation_upper', ['resistance_band'], ['biceps'], [], {
    incrementKg: 0,
  }),
  e('Agachamento com elástico', 'squat', ['resistance_band'], ['quads', 'glutes'], [], {
    incrementKg: 0,
  }),
];
