import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class StatsRangeQuery {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
