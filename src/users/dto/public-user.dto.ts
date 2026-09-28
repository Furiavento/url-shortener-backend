import { ApiProperty } from '@nestjs/swagger';
import { type UserRole, userRole } from '../../database/schema.js';

/** A user as exposed by the API (never includes the password hash). */
export class PublicUserDto {
  /** @example "5d8cd64a-f031-466f-bac4-c307e42e1483" */
  id: string;
  /** @example "demo@example.com" */
  email: string;
  /** @example "Demo User" */
  name: string;
  @ApiProperty({ enum: userRole.enumValues, enumName: 'UserRole' })
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
