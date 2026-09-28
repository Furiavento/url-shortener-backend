import { Controller, Get, Logger, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { Public } from '../common/decorators/public.decorator.js';
import { UrlsService } from '../urls/urls.service.js';

/** Served at the root: RedirectModule is not mounted under /api (see app.module.ts). */
@Public()
@Controller()
export class RedirectController {
  private readonly logger = new Logger(RedirectController.name);

  constructor(
    private readonly urls: UrlsService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get(':code')
  async redirect(
    @Param('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.urls.resolve(code);

    // 302 (not 301) so browsers don't cache the redirect and every click is counted.
    res.redirect(302, url.originalUrl);

    this.analytics.recordClick(url.id, req).catch((error: unknown) => {
      this.logger.error(`Failed to record click for url ${url.id}`, error);
    });
  }
}
