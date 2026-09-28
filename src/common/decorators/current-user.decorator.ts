import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../../database/schema.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & { user: JwtPayload };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
