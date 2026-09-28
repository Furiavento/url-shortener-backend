import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from '../common/decorators/public.decorator.js';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { HealthDto } from './dto/health.dto.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Reports whether the API and its database are reachable. */
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  @Get()
  async check(): Promise<HealthDto> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
