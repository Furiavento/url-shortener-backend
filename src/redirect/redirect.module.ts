import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { UrlsModule } from '../urls/urls.module.js';
import { RedirectController } from './redirect.controller.js';

@Module({
  imports: [UrlsModule, AnalyticsModule],
  controllers: [RedirectController],
})
export class RedirectModule {}
