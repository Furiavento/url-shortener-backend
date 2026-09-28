import { relations } from 'drizzle-orm';
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const createdAt = () =>
  timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const userRole = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: text().notNull(),
  name: varchar({ length: 100 }).notNull(),
  role: userRole().notNull().default('user'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const urls = pgTable(
  'urls',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: varchar({ length: 16 }).notNull().unique(),
    originalUrl: text().notNull(),
    clicks: bigint({ mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('urls_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

export const clickEvents = pgTable(
  'click_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    urlId: bigint({ mode: 'number' })
      .notNull()
      .references(() => urls.id, { onDelete: 'cascade' }),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    referrerHost: varchar({ length: 255 }),
    browser: varchar({ length: 50 }),
    os: varchar({ length: 50 }),
    deviceType: varchar({ length: 20 }),
    ipHash: varchar({ length: 64 }),
  },
  (table) => [
    index('click_events_url_id_occurred_at_idx').on(
      table.urlId,
      table.occurredAt,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  urls: many(urls),
}));

export const urlsRelations = relations(urls, ({ one, many }) => ({
  user: one(users, { fields: [urls.userId], references: [users.id] }),
  clickEvents: many(clickEvents),
}));

export const clickEventsRelations = relations(clickEvents, ({ one }) => ({
  url: one(urls, { fields: [clickEvents.urlId], references: [urls.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof userRole.enumValues)[number];
export type Url = typeof urls.$inferSelect;
export type NewUrl = typeof urls.$inferInsert;
export type ClickEvent = typeof clickEvents.$inferSelect;
export type NewClickEvent = typeof clickEvents.$inferInsert;
