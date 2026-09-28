import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bowser from 'bowser';
import { and, count, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { clickEvents, urls } from '../database/schema.js';
import type {
  BreakdownDto,
  DailyClicksDto,
  OverviewDto,
  UrlStatsDto,
} from './dto/analytics-response.dto.js';
import type { StatsRangeQuery } from './dto/stats-range.query.js';
import { hashIp } from './ip-hash.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const BREAKDOWN_LIMIT = 10;

// A type alias (not a class or interface) so it satisfies db.execute's Record constraint.
type DailyClicksRow = { date: string; clicks: number };

@Injectable()
export class AnalyticsService {
  private readonly ipHashSalt: string;
  private readonly shortUrlBase: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    config: ConfigService<Env, true>,
  ) {
    this.ipHashSalt = config.get('IP_HASH_SALT');
    this.shortUrlBase = config.get('SHORT_URL_BASE');
  }

  async recordClick(urlId: number, req: Request): Promise<void> {
    const userAgent = req.get('user-agent');
    const parsed = userAgent ? Bowser.parse(userAgent) : undefined;

    await this.db.transaction(async (tx) => {
      await tx.insert(clickEvents).values({
        urlId,
        referrerHost: this.referrerHost(req.get('referer')),
        // Bowser returns "" for unrecognized agents (e.g. curl); store those as null.
        browser: parsed?.browser.name?.slice(0, 50) || null,
        os: parsed?.os.name?.slice(0, 50) || null,
        deviceType: parsed?.platform.type?.slice(0, 20) || null,
        ipHash: req.ip ? hashIp(req.ip, this.ipHashSalt) : null,
      });
      await tx
        .update(urls)
        .set({ clicks: sql`${urls.clicks} + 1` })
        .where(eq(urls.id, urlId));
    });
  }

  async overview(userId: string): Promise<OverviewDto> {
    const to = new Date();
    const from = new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    const ownedByUser = eq(urls.userId, userId);

    const [[totals], [recent], topUrls, clicksByDay] = await Promise.all([
      this.db
        .select({
          totalUrls: count(),
          totalClicks: sql<number>`coalesce(sum(${urls.clicks}), 0)`.mapWith(
            Number,
          ),
        })
        .from(urls)
        .where(ownedByUser),
      this.db
        .select({ clicks: count() })
        .from(clickEvents)
        .innerJoin(urls, eq(urls.id, clickEvents.urlId))
        .where(and(ownedByUser, gte(clickEvents.occurredAt, from))),
      this.db
        .select({
          id: urls.id,
          code: urls.code,
          originalUrl: urls.originalUrl,
          clicks: urls.clicks,
        })
        .from(urls)
        .where(ownedByUser)
        .orderBy(desc(urls.clicks), desc(urls.createdAt))
        .limit(5),
      this.clicksByDay(ownedByUser, from, to),
    ]);

    return {
      totalUrls: totals.totalUrls,
      totalClicks: totals.totalClicks,
      clicksLast30Days: recent.clicks,
      topUrls: topUrls.map((url) => ({
        ...url,
        shortUrl: `${this.shortUrlBase}/${url.code}`,
      })),
      clicksByDay,
    };
  }

  async urlStats(
    userId: string,
    urlId: number,
    range: StatsRangeQuery,
  ): Promise<UrlStatsDto> {
    const { from, to } = this.resolveRange(range);

    const [owned] = await this.db
      .select({ id: urls.id })
      .from(urls)
      .where(and(eq(urls.id, urlId), eq(urls.userId, userId)));
    if (!owned) throw new NotFoundException('URL not found');

    const forUrl = eq(clickEvents.urlId, urlId);
    const inRange = and(
      forUrl,
      gte(clickEvents.occurredAt, from),
      lt(clickEvents.occurredAt, to),
    )!;

    const [[total], clicksByDay, topReferrers, browsers, os, devices] =
      await Promise.all([
        this.db.select({ clicks: count() }).from(clickEvents).where(inRange),
        this.clicksByDay(forUrl, from, to),
        this.breakdown(clickEvents.referrerHost, inRange, 'Direct'),
        this.breakdown(clickEvents.browser, inRange),
        this.breakdown(clickEvents.os, inRange),
        this.breakdown(clickEvents.deviceType, inRange),
      ]);

    return {
      from,
      to,
      totalClicks: total.clicks,
      clicksByDay,
      topReferrers,
      browsers,
      os,
      devices,
    };
  }

  private resolveRange({ from, to }: StatsRangeQuery): {
    from: Date;
    to: Date;
  } {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    if (start >= end) {
      throw new BadRequestException('"from" must be earlier than "to"');
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(
        `Range cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    }
    return { from: start, to: end };
  }

  /** One row per UTC day in [from, to], zero-filled so charts need no gaps handling. */
  private async clicksByDay(
    filter: SQL,
    from: Date,
    to: Date,
  ): Promise<DailyClicksDto[]> {
    const day = sql`date_trunc('day', ${clickEvents.occurredAt} at time zone 'UTC')`;
    const result = await this.db.execute<DailyClicksRow>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as "date",
             coalesce(c.clicks, 0)::int as "clicks"
      from generate_series(
        date_trunc('day', ${from.toISOString()}::timestamptz at time zone 'UTC'),
        date_trunc('day', ${to.toISOString()}::timestamptz at time zone 'UTC'),
        interval '1 day'
      ) as d(day)
      left join (
        select ${day} as day, count(*) as clicks
        from ${clickEvents}
        inner join ${urls} on ${urls.id} = ${clickEvents.urlId}
        where ${filter}
          and ${clickEvents.occurredAt} >= ${from.toISOString()}
          and ${clickEvents.occurredAt} < ${to.toISOString()}
        group by 1
      ) as c on c.day = d.day
      order by d.day
    `);
    return result.rows;
  }

  private async breakdown(
    column: AnyPgColumn,
    where: SQL,
    nullLabel = 'Unknown',
  ): Promise<BreakdownDto[]> {
    const clicks = count();
    const rows = await this.db
      .select({ label: column, clicks })
      .from(clickEvents)
      .where(where)
      .groupBy(column)
      .orderBy(desc(clicks))
      .limit(BREAKDOWN_LIMIT);
    return rows.map((row) => ({
      label: (row.label as string | null) ?? nullLabel,
      clicks: row.clicks,
    }));
  }

  private referrerHost(referer: string | undefined): string | null {
    if (!referer) return null;
    try {
      return new URL(referer).host.slice(0, 255) || null;
    } catch {
      return null;
    }
  }
}
