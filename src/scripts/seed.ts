/**
 * Development seed: (re)creates a demo user with URLs and ~90 days of clicks so
 * the dashboard has realistic data. Deterministic and idempotent: it only
 * touches the demo user, which is deleted (with its data) and recreated.
 *
 *   pnpm db:seed
 */
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { hashIp } from '../analytics/ip-hash.js';
import { hashPassword } from '../auth/password.js';
import { validateEnv } from '../config/env.js';
import { createDatabase } from '../database/database.module.js';
import {
  clickEvents,
  type NewClickEvent,
  urls,
  users,
} from '../database/schema.js';
import { SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH } from '../urls/short-code.js';

const DEMO_USER = {
  email: 'demo@example.com',
  password: 'demo12345',
  name: 'Demo User',
};
const DAY_MS = 24 * 60 * 60 * 1000;
const INSERT_BATCH = 1000;

// mulberry32: small seeded PRNG so every run produces the same data.
function createRandom(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    /** Poisson sample (Knuth); fine for the small rates used here. */
    poisson(lambda: number): number {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = next();
      while (p > limit) {
        k++;
        p *= next();
      }
      return k;
    },
    weighted<T>(options: readonly (readonly [T, number])[]): T {
      const total = options.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of options) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return options[options.length - 1][0];
    },
  };
}

interface SeedUrl {
  url: string;
  alias?: string;
  createdDaysAgo: number;
  /** Relative popularity (expected clicks per day). */
  weight: number;
  /** Negative = already expired that many days ago. */
  expiresInDays?: number;
  /** Launch campaign: extra clicks decaying over the first days. */
  spike?: boolean;
}

const SEED_URLS: SeedUrl[] = [
  {
    url: 'https://angular.dev/overview',
    alias: 'ng-docs',
    createdDaysAgo: 85,
    weight: 10,
  },
  { url: 'https://nestjs.com', alias: 'nest', createdDaysAgo: 80, weight: 7 },
  {
    url: 'https://orm.drizzle.team/docs/overview',
    createdDaysAgo: 70,
    weight: 5,
  },
  { url: 'https://github.com/nestjs/nest', createdDaysAgo: 60, weight: 4 },
  {
    url: 'https://www.postgresql.org/docs/current/',
    createdDaysAgo: 55,
    weight: 3,
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
    createdDaysAgo: 45,
    weight: 3,
  },
  {
    url: 'https://www.typescriptlang.org/docs/',
    alias: 'ts-docs',
    createdDaysAgo: 40,
    weight: 2,
  },
  { url: 'https://news.ycombinator.com', createdDaysAgo: 30, weight: 2 },
  {
    url: 'https://example.com/blog/launch-announcement',
    alias: 'launch',
    createdDaysAgo: 21,
    weight: 4,
    spike: true,
  },
  {
    url: 'https://example.com/black-friday',
    alias: 'promo-bf',
    createdDaysAgo: 88,
    weight: 6,
    expiresInDays: -20,
  },
  {
    url: 'https://example.com/webinar-registration',
    createdDaysAgo: 7,
    weight: 3,
    expiresInDays: 14,
  },
  {
    url: 'https://example.com/draft-landing-page',
    createdDaysAgo: 2,
    weight: 0,
  },
];

type Client = Pick<NewClickEvent, 'deviceType' | 'os' | 'browser'>;
type Weighted<T> = [T, number][];

// Labels match what bowser produces for real traffic (see AnalyticsService.recordClick).
const CLIENTS: Weighted<Client> = [
  [{ deviceType: 'desktop', os: 'Windows', browser: 'Chrome' }, 30],
  [{ deviceType: 'desktop', os: 'Windows', browser: 'Microsoft Edge' }, 8],
  [{ deviceType: 'desktop', os: 'Windows', browser: 'Firefox' }, 5],
  [{ deviceType: 'desktop', os: 'macOS', browser: 'Chrome' }, 8],
  [{ deviceType: 'desktop', os: 'macOS', browser: 'Safari' }, 7],
  [{ deviceType: 'desktop', os: 'Linux', browser: 'Firefox' }, 3],
  [{ deviceType: 'desktop', os: 'Linux', browser: 'Chrome' }, 2],
  [{ deviceType: 'mobile', os: 'Android', browser: 'Chrome' }, 17],
  [
    {
      deviceType: 'mobile',
      os: 'Android',
      browser: 'Samsung Internet for Android',
    },
    3,
  ],
  [{ deviceType: 'mobile', os: 'iOS', browser: 'Safari' }, 12],
  [{ deviceType: 'mobile', os: 'iOS', browser: 'Chrome' }, 2],
  [{ deviceType: 'tablet', os: 'iOS', browser: 'Safari' }, 2],
  [{ deviceType: 'tablet', os: 'Android', browser: 'Chrome' }, 1],
  [{ deviceType: null, os: null, browser: null }, 1], // bots, curl...
];

const REFERRERS: Weighted<string | null> = [
  [null, 35], // direct
  ['www.google.com', 20],
  ['t.co', 10],
  ['www.linkedin.com', 8],
  ['news.ycombinator.com', 6],
  ['www.reddit.com', 6],
  ['github.com', 5],
  ['www.facebook.com', 4],
  ['duckduckgo.com', 3],
];

// Visits are more likely during the (UTC) day than at night.
const HOUR_WEIGHTS = Array.from(
  { length: 24 },
  (_, hour) => [hour, hour < 7 ? 1 : hour < 9 ? 3 : hour < 22 ? 6 : 3] as const,
);

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on variables already present in the environment.
  }
  const env = validateEnv(process.env);
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed with NODE_ENV=production');
  }

  const random = createRandom(20260928);
  const now = new Date();
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const randomCode = () =>
    Array.from(
      { length: SHORT_CODE_LENGTH },
      () => SHORT_CODE_ALPHABET[random.int(SHORT_CODE_ALPHABET.length)],
    ).join('');

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = createDatabase(pool);
  try {
    const passwordHash = await hashPassword(DEMO_USER.password);
    const summary = await db.transaction(async (tx) => {
      // Cascades to the demo user's URLs, clicks and refresh tokens.
      await tx.delete(users).where(eq(users.email, DEMO_USER.email));
      const [user] = await tx
        .insert(users)
        .values({
          email: DEMO_USER.email,
          name: DEMO_USER.name,
          passwordHash,
          createdAt: daysAgo(90),
          updatedAt: daysAgo(90),
        })
        .returning({ id: users.id });

      let totalClicks = 0;
      for (const seed of SEED_URLS) {
        const createdAt = daysAgo(seed.createdDaysAgo);
        const expiresAt =
          seed.expiresInDays === undefined
            ? null
            : daysAgo(-seed.expiresInDays);
        const [url] = await tx
          .insert(urls)
          .values({
            userId: user.id,
            code: seed.alias ?? randomCode(),
            originalUrl: seed.url,
            createdAt,
            updatedAt: createdAt,
            expiresAt,
          })
          .returning({ id: urls.id });

        // Clicks stop at the expiration date (expired links answer 410).
        const clicksUntil = Math.min(
          now.getTime(),
          expiresAt?.getTime() ?? Infinity,
        );
        const visitors = Math.max(20, seed.weight * 40);
        const events: NewClickEvent[] = [];
        for (
          let dayStart = startOfToday - seed.createdDaysAgo * DAY_MS;
          dayStart <= startOfToday;
          dayStart += DAY_MS
        ) {
          const weekday = new Date(dayStart).getUTCDay();
          const weekendFactor = weekday === 0 || weekday === 6 ? 0.6 : 1;
          const daysLive = (dayStart - createdAt.getTime()) / DAY_MS;
          const spikeFactor = seed.spike
            ? 1 + 6 * Math.exp(-Math.max(0, daysLive) / 4)
            : 1;
          const clicks = random.poisson(
            seed.weight * weekendFactor * spikeFactor,
          );

          for (let i = 0; i < clicks; i++) {
            const occurredAt = new Date(
              dayStart +
                random.weighted(HOUR_WEIGHTS) * 3_600_000 +
                random.int(3_600_000),
            );
            if (occurredAt < createdAt || occurredAt.getTime() > clicksUntil) {
              continue;
            }
            const client = random.weighted(CLIENTS);
            // Documentation-range IPs (RFC 5737); only their hash is stored.
            const visitor = random.int(visitors);
            events.push({
              urlId: url.id,
              occurredAt,
              referrerHost: random.weighted(REFERRERS),
              browser: client.browser,
              os: client.os,
              deviceType: client.deviceType,
              ipHash: hashIp(
                `198.51.${Math.floor(visitor / 256)}.${visitor % 256}`,
                env.IP_HASH_SALT,
              ),
            });
          }
        }

        for (let i = 0; i < events.length; i += INSERT_BATCH) {
          await tx
            .insert(clickEvents)
            .values(events.slice(i, i + INSERT_BATCH));
        }
        await tx
          .update(urls)
          .set({ clicks: events.length, updatedAt: sql`${urls.updatedAt}` })
          .where(eq(urls.id, url.id));
        totalClicks += events.length;
      }
      return { urls: SEED_URLS.length, clicks: totalClicks };
    });

    console.log(
      `Seeded ${summary.urls} URLs and ${summary.clicks} clicks.\n` +
        `Log in with ${DEMO_USER.email} / ${DEMO_USER.password}`,
    );
  } finally {
    await pool.end();
  }
}

await main();
