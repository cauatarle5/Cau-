import { mkdirSync, writeFileSync } from 'node:fs';

import Anthropic from '@anthropic-ai/sdk';

import { anthropicTransport, scriptedTransport } from '@atlas/ai';
import { createDb } from '@atlas/db';

import { coachEvalReport, runCoachEval } from '../src/demo/eval-coach';

// Com ANTHROPIC_API_KEY e AI_MODEL_CHAT: modelo real (custa tokens). Sem: roteiro (harness).
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definido');
const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.AI_MODEL_CHAT;
const real = Boolean(key && model);
const transport = real ? anthropicTransport(new Anthropic({ apiKey: key })) : scriptedTransport();
const modelName = real && model ? model : 'scripted (sem chave: só o harness)';

const { db, close } = createDb(url);
try {
  const results = await runCoachEval({ db, transport, model: real && model ? model : 'scripted' });
  const date = new Date().toISOString().slice(0, 10);
  const report = coachEvalReport(results, { model: modelName, date });
  mkdirSync('eval-reports', { recursive: true });
  const file = `eval-reports/coach-${date}-${real ? 'real' : 'scripted'}.md`;
  writeFileSync(file, report);
  const passed = results.filter((r) => r.pass).length;
  console.log(
    `${String(passed)}/${String(results.length)} perguntas ok (${modelName}). Relatório: apps/api/${file}`,
  );
  for (const r of results.filter((x) => !x.pass))
    console.log(
      `- ${r.question}: faltou ${JSON.stringify(r.missingTools)}, soltos ${JSON.stringify(r.ungrounded)} ${r.error ?? ''}`,
    );
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await close();
}
