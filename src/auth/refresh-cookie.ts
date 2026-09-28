import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env.js';

export const REFRESH_COOKIE = 'refresh_token';

// Only sent to the auth endpoints (refresh/logout), never to the rest of the API.
const REFRESH_COOKIE_PATH = '/api/auth';

export function refreshCookieOptions(
  config: ConfigService<Env, true>,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get<boolean>('COOKIE_SECURE'),
    sameSite: config.get<Env['COOKIE_SAMESITE']>('COOKIE_SAMESITE'),
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  config: ConfigService<Env, true>,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions(config),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(
  res: Response,
  config: ConfigService<Env, true>,
): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(config));
}
