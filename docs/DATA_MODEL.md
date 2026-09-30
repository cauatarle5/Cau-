# DATA_MODEL: Atlas

Condensado de `PROMPT_MESTRE.md` Parte 4. Tabelas são criadas na fase em que são usadas (ver ROADMAP); este documento é o alvo completo.

## Convenções
- PK `id uuid` (v7). `user_id` em toda tabela de dados do usuário. `created_at`, `updated_at`.
- Exclusão lógica (`deleted_at`) em registros de histórico.
- Enums como tipos Postgres ou tabelas de referência.
- Catálogos globais (foods, exercises): `user_id` nulo = sistema; preenchido = personalizado.
- Unidades internas: kg, g, ml, cm, kcal, s. Instantes em `timestamptz` (UTC); `date` = dia do usuário.
- Nutrientes ausentes são `null`, nunca zero implícito.
- Snapshots imutáveis em registros de histórico (`meal_items.nutrients_snapshot`, `goal_snapshot`, etc.).

## 4.1 Identidade e perfil
| Tabela | Colunas |
|---|---|
| users | id, email (citext único), password_hash, name, timezone (`America/Sao_Paulo`), locale, created_at |
| sessions | id, user_id, token_hash, expires_at, user_agent, ip, created_at |
| profiles (1:1) | sex (`male\|female`, só fórmulas), birth_date, height_cm, training_experience (`beginner\|intermediate\|advanced`), training_age_years, conditioning_level (1–5), activity_lifestyle (`sedentary\|light\|moderate\|high`), aesthetic_priorities text[], performance_priorities text[], notes, clinical_condition boolean (ADR-017) |
| availability | id, user_id, weekday (0–6), start_time, end_time, max_minutes, kind (`gym\|sport\|any`) |
| equipment_access | id, user_id, equipment_code → equipment, location (`gym\|home\|other`) |
| limitations | id, user_id, body_region, description, severity (1–3), contraindicated_patterns text[], active, started_at, resolved_at |
| exercise_preferences | user_id, exercise_id, preference (`like\|neutral\|dislike\|avoid`) |
| goals (versionado, só insert) | id, user_id, primary_goal (`fat_loss\|maintenance\|muscle_gain\|recomposition\|performance`), target_weight_kg, target_body_fat_pct, target_rate_pct_per_week, protein_g_per_kg (nulo = padrão), training_focus, effective_from, created_at |
| sports | id, user_id, sport_code (`football\|futsal\|running\|cycling\|swimming\|other`), weekly_frequency, typical_duration_min, typical_intensity (1–5), weekday_hint |

## 4.2 Corpo
| Tabela | Colunas |
|---|---|
| body_measurements | id, user_id, measured_at, date, weight_kg, body_fat_pct, body_fat_method (`bioimpedance\|skinfold\|dexa\|visual\|other`), waist_cm, hip_cm, chest_cm, arm_l_cm, arm_r_cm, thigh_l_cm, thigh_r_cm, calf_cm, neck_cm, notes. Tudo opcional exceto data; ≥ 1 valor |
| progress_photos (futuro, vazia) | id, user_id, date, pose, storage_key |

## 4.3 Treinamento
| Tabela | Colunas |
|---|---|
| equipment | code PK, name_pt |
| muscles | code PK, name_pt, group (`push\|pull\|legs\|core`), region (`upper\|lower\|core`). Conjunto: chest, front_delts, side_delts, rear_delts, lats, upper_back, traps, biceps, triceps, forearms, abs, obliques, lower_back, glutes, quads, hamstrings, adductors, abductors, calves |
| exercises | id, user_id, name_pt, aliases text[], movement_pattern (`horizontal_push\|vertical_push\|horizontal_pull\|vertical_pull\|squat\|hinge\|lunge\|isolation_upper\|isolation_lower\|core\|carry\|cardio`), mechanics (`compound\|isolation`), laterality (`bilateral\|unilateral`), equipment_codes text[], load_type (`external\|bodyweight\|assisted\|time`), default_increment_kg, contraindication_tags text[], instructions, is_active |
| exercise_muscles | exercise_id, muscle_code, role (`primary\|secondary`), weight (1,0 / 0,5) |
| programs | id, user_id, name, goal_snapshot, start_date, end_date, status (`draft\|active\|completed\|archived`), generated_by (`rules\|ai_assisted\|manual`), notes |
| mesocycles | id, program_id, order, name, phase (`accumulation\|intensification\|realization\|deload`), weeks, start_date, rir_progression int[], volume_progression numeric[] |
| workout_templates | id, program_id, name, day_order, focus_muscles text[], estimated_minutes |
| template_exercises | id, workout_template_id, order, exercise_id, sets, rep_min, rep_max, target_rir, rest_seconds, superset_group, notes |
| planned_workouts | id, user_id, date, workout_template_id, mesocycle_id, week_index, status (`planned\|done\|skipped\|moved\|adapted`), adaptation_reason, adapted_payload jsonb |
| workout_sessions | id, user_id, date, planned_workout_id?, workout_template_id? (ADR-035), name (snapshot), started_at, ended_at, duration_min, session_rpe (1–10), perceived_difficulty (1–5), notes, source (`app\|offline_sync\|import`) |
| session_exercises | id, session_id, order, exercise_id, exercise_name (snapshot), template_exercise_id?, substituted_from_exercise_id, status (`pending\|done\|skipped\|substituted`, ADR-036), skip_reason, target_sets, rep_min, rep_max, target_rir, rest_seconds (snapshot das metas), notes |
| set_logs | id, session_exercise_id, set_index, set_type (`warmup\|working\|drop\|failure\|backoff`), reps, load_kg, rir, rpe, rest_seconds, duration_seconds, completed, logged_at. RIR = 10 − RPE |
| pain_reports | id, user_id, date, session_id?, body_region, intensity (0–10), during_exercise_id?, type (`joint\|muscle\|other`), notes |
| activities | id, user_id, date, started_at, sport_code, duration_min, intensity_rpe (1–10), distance_km, avg_hr, kcal_reported, lower_body_demand (1–3), notes, source (`manual\|wearable`) |
| personal_records | id, user_id, exercise_id, record_type (`e1rm\|max_load\|rep_at_load\|volume_session`), value, reps, load_kg, set_log_id, session_id, achieved_at. Recalculado a cada alteração (ADR-037) |

| idempotency_keys (ADR-034) | user_id, key (PK composta), method, path, status_code, response jsonb, created_at |

## 4.4 Recuperação
| Tabela | Colunas |
|---|---|
| daily_checkins | id, user_id, date (único por usuário), sleep_hours, sleep_quality, energy, stress, fatigue, soreness (1–5), soreness_regions text[], available_minutes, notes, readiness_score (persistido), created_at |
| training_load_daily (job) | user_id, date, load_au, acute_7d, chronic_28d, acwr, monotony_7d, strain_7d |

## 4.5 Alimentos
| Tabela | Colunas |
|---|---|
| food_sources | code (`taco\|tbca\|usda\|off\|user\|recipe`), name, license_note |
| foods | id, user_id, source_code, source_ref, name_pt, name_normalized (trigram), brand, category (`cereals\|legumes\|meats\|poultry\|fish\|eggs\|dairy\|fruits\|vegetables\|tubers\|fats_oils\|sweets\|beverages\|supplements\|prepared\|other`), state (`raw\|cooked\|grilled\|fried\|boiled\|roasted\|ready`), default_unit (`g\|ml`), density_g_per_ml, is_verified, barcode, created_at |
| food_nutrients (por 100 g/ml) | food_id PK, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg, potassium_mg?, calcium_mg?, iron_mg?, cholesterol_mg? |
| food_aliases | id, food_id, user_id (nulo = sistema; ADR-030), alias_normalized |
| household_measures | id, food_id?, user_id?, unit_code (`unit\|slice\|tbsp\|tsp\|cup\|scoop\|ladle\|portion\|pinch\|glass\|can\|small\|medium\|large`), label_pt, grams, is_default |
| user_food_usage | user_id, food_id, times_used, last_used_at, last_quantity_g, last_unit_code |

## 4.6 Receitas
| Tabela | Colunas |
|---|---|
| recipes | id, user_id, name, description, servings (1), cooked_weight_g?, is_favorite, tags text[], instructions, created_at |
| recipe_ingredients | id, recipe_id, food_id, quantity, unit_code, grams, order |
| recipe_nutrition_cache | recipe_id, total jsonb, per_serving jsonb, per_100g jsonb, computed_at |

Receita como alimento: `foods.source_code = 'recipe'`, `source_ref = recipe_id`.

## 4.7 Nutrição
| Tabela | Colunas |
|---|---|
| nutrition_targets | id, user_id, date, day_type (`rest\|training\|hard_training\|sport\|sport_and_training`), kcal, protein_g, carbs_g, fat_g, fiber_g, water_ml, method (`formula\|adaptive`), inputs jsonb, goal_id, day_type_overridden (ADR-030), created_at. Único (user_id, date) |
| energy_estimates | id, user_id, week_start, tdee_formula, tdee_observed, tdee_used, confidence (`low\|medium\|high`), weight_trend_kg, intake_avg_kcal, logged_days, weigh_in_count |
| meals | id, user_id, date, slot (`breakfast\|morning_snack\|lunch\|afternoon_snack\|pre_workout\|post_workout\|dinner\|supper\|other`), status (`planned\|logged`), eaten_at, name, notes, source_text, created_at |
| meal_items | id, meal_id, food_id \| recipe_id, food_name (ADR-030), quantity, unit_code, grams, nutrients_snapshot jsonb, parse_confidence, created_at |
| meal_templates | id, user_id, name, items jsonb, slot_hint |
| water_logs | id, user_id, date, ml, logged_at |

## 4.8 Inteligência
| Tabela | Colunas |
|---|---|
| insights | id, user_id, generated_at, period_start, period_end, category (`training\|nutrition\|body\|recovery\|integration`), type, severity (`info\|attention\|warning`), title_pt, body_pt, data jsonb, status (`new\|seen\|dismissed\|acted`), expires_at |
| ai_conversations | id, user_id, title, created_at, updated_at |
| ai_messages | id, conversation_id, role (`user\|assistant\|tool`), content jsonb, tool_calls jsonb, tokens_in, tokens_out, model, created_at |
| ai_action_proposals | id, user_id, conversation_id, action_type (`log_meal\|plan_meal\|swap_exercise\|adapt_workout\|update_goal\|create_recipe`), payload jsonb, status (`pending\|accepted\|rejected\|expired`), created_at, resolved_at |
| parser_feedback | id, user_id, input_text, parsed jsonb, corrected jsonb, created_at |

## 4.9 Transversais
| Tabela | Colunas |
|---|---|
| events | id, user_id, type (ex.: `meal.logged`), entity_id, payload, created_at |
| integrations (futuro, vazia) | id, user_id, provider, status, scopes, last_sync_at |
| daily_context | user_id, date, day_type, planned_workout_id, session_id, activities_load, readiness_score, kcal_consumed, protein_consumed, targets_id |

## 4.10 Índices obrigatórios
- `(user_id, date)` em todas as tabelas diárias.
- GIN trigram em `foods.name_normalized` e `food_aliases.alias_normalized`.
- `(user_id, exercise_id, logged_at)` para progressão (via join session_exercises).
- `(user_id, status, date)` em `meals` e `planned_workouts`.

## Estado atual
- Fase 0: `users`, `sessions`; extensões `pg_trgm`, `unaccent`, `citext`.
- Fase 1: `profiles` (+ `clinical_condition`), `availability`, `equipment` (seed), `equipment_access`, `limitations`, `goals`, `sports`, `body_measurements`. Enums como tipos Postgres. `exercise_preferences` fica para a Fase 3 (ADR-019).
- Fase 2: `food_sources`, `foods` (591 itens TACO), `food_nutrients`, `food_aliases`, `household_measures`, `user_food_usage`, `meals`, `meal_items`, `water_logs`, `nutrition_targets`, `parser_feedback`.
- Fase 3: `muscles` (19, seed), `exercises` (157 de sistema, seed idempotente por nome; trigram no nome), `exercise_muscles`, `exercise_preferences`, `programs` (índice parcial: um `active` por usuário), `workout_templates`, `template_exercises`, `workout_sessions`, `session_exercises`, `set_logs`, `personal_records`, `idempotency_keys`. Progressão por exercício via join `set_logs` → `session_exercises (exercise_id, session_id)` → `workout_sessions (user_id, date)`.
