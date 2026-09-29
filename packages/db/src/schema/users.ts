import { pgTable, text } from 'drizzle-orm/pg-core';

import { citext, createdAt, idColumn, updatedAt } from './columns.js';

export const users = pgTable('users', {
  id: idColumn(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  locale: text('locale').notNull().default('pt-BR'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
