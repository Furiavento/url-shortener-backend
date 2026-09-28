import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { AnalyticsService } from './analytics.service.js';
import { OverviewDto, UrlStatsDto } from './dto/analytics-response.dto.js';
import { StatsRangeQuery } from './dto/stats-range.query.js';

@ApiTags('analytics')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Dashboard summary across all of the user's URLs. */
  @Get('overview')
  overview(@CurrentUser() user: JwtPayload): Promise<OverviewDto> {
    return this.analytics.overview(user.sub);
  }

  /** Click statistics for one URL. Defaults to the last 30 days. */
  @ApiBadRequestResponse({
    description: 'Invalid range (from >= to or over 366 days)',
  })
  @ApiNotFoundResponse({
    description: 'URL not found or not owned by the user',
  })
  @Get('urls/:id')
  urlStats(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() range: StatsRangeQuery,
  ): Promise<UrlStatsDto> {
    return this.analytics.urlStats(user.sub, id, range);
  }
}
