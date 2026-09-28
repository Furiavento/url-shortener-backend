import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsUrl,
  MaxLength,
  MinDate,
  ValidateIf,
} from 'class-validator';

export class UpdateUrlDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url?: string;

  /** `null` removes the expiration. */
  @ValidateIf((_obj, value) => value !== null && value !== undefined)
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'expiresAt must be in the future' })
  expiresAt?: Date | null;
}
