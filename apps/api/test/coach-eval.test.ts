import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';

import { scriptedTransport } from '@atlas/ai';
import { createDb } from '@atlas/db';

import { runCoachEval } from '../src/demo/eval-coach';

describe('coach eval harness (P10.4) with the scripted transport', () => {
  it('14 questions use the expected tools and cite only grounded numbers', async () => {
    const handle = createDb(inject('databaseUrl'));
    try {
      const results = await runCoachEval({
        db: handle.db,
        transport: scriptedTransport(),
        model: 'scripted',
        email: 'demo-eval@atlas.app',
      });
      expect(results).toHaveLength(14);
      expect(results.filter((r) => !r.pass)).toEqual([]);
      // Respostas citam números reais do demo (não só texto vazio).
      expect(results.find((r) => r.id === 'peso')?.text).toMatch(/kg/);
    } finally {
      await handle.close();
    }
  }, 120_000);
});
