import { describe, expect, it } from 'vitest';

import { loginInputSchema, registerInputSchema } from './auth';
import { errorCodeSchema } from './errors';

describe('registerInputSchema', () => {
  it('normalizes e-mail and trims name', () => {
    const parsed = registerInputSchema.parse({
      name: '  Ana  ',
      email: '  Ana@Example.COM ',
      password: 'correct-horse',
    });
    expect(parsed).toEqual({ name: 'Ana', email: 'ana@example.com', password: 'correct-horse' });
  });

  it('rejects short passwords and invalid e-mails', () => {
    const result = registerInputSchema.safeParse({ name: 'Ana', email: 'nope', password: '123' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });
});

describe('loginInputSchema', () => {
  it('requires a password', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('errorCodeSchema', () => {
  it('accepts stable codes only', () => {
    expect(errorCodeSchema.parse('VALIDATION_ERROR')).toBe('VALIDATION_ERROR');
    expect(errorCodeSchema.safeParse('whatever').success).toBe(false);
  });
});
