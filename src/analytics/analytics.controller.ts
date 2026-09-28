import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { AnalyticsService } from './analytics.service.js';
import { StatsRangeQuery } from './dto/stats-range.query.js';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentUser() user: JwtPayload) {
    return this.analytics.overview(user.sub);
  }

  @Get('urls/:id')
  urlStats(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() range: StatsRangeQuery,
  ) {
    return this.analytics.urlStats(user.sub, id, range);
  }
}
