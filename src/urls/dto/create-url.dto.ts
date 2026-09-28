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
import { ALIAS_PATTERN } from '../short-code.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUrlDto {
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url: string;

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
  expiresAt?: Date;
}
