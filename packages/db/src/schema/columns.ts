import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/** Texto case-insensitive (extensão `citext`). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

/** PK uuid v7 gerado na aplicação (ADR-008). */
export const idColumn = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
