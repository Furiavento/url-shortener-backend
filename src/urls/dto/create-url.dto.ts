import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinDate,
} from 'class-validator';
import { ALIAS_PATTERN, RESERVED_CODES } from '../short-code.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUrlDto {
  /** Destination URL (http or https). */
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url: string;

  @ApiPropertyOptional({
    description: `Custom short code. Reserved: ${[...RESERVED_CODES].join(', ')}.`,
    pattern: ALIAS_PATTERN.source,
    example: 'ng-docs',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(ALIAS_PATTERN, {
    message: 'alias must be 3-16 characters: letters, digits, "_" or "-"',
  })
  alias?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'expiresAt must be in the future' })
  /** Must be in the future. Omit for a link that never expires. */
  expiresAt?: Date;
}
