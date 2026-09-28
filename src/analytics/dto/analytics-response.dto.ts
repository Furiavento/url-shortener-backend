export class DailyClicksDto {
  /**
   * UTC day.
   * @example "2026-09-28"
   */
  date: string;
  clicks: number;
}

export class BreakdownDto {
  /**
   * Referrer host, browser, OS or device type. `Direct` / `Unknown` when missing.
   * @example "Chrome"
   */
  label: string;
  clicks: number;
}

export class TopUrlDto {
  id: number;
  code: string;
  shortUrl: string;
  originalUrl: string;
  clicks: number;
}

export class OverviewDto {
  totalUrls: number;
  totalClicks: number;
  clicksLast30Days: number;
  /** The user's 5 most clicked URLs. */
  topUrls: TopUrlDto[];
  /** Last 30 days, one entry per UTC day (zero-filled). */
  clicksByDay: DailyClicksDto[];
}

export class UrlStatsDto {
  from: Date;
  to: Date;
  /** Clicks within [from, to). */
  totalClicks: number;
  /** One entry per UTC day in the range (zero-filled). */
  clicksByDay: DailyClicksDto[];
  /** Top 10 referrer hosts. */
  topReferrers: BreakdownDto[];
  /** Top 10 browsers. */
  browsers: BreakdownDto[];
  /** Top 10 operating systems. */
  os: BreakdownDto[];
  /** Top 10 device types (desktop, mobile, tablet...). */
  devices: BreakdownDto[];
}
