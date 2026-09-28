import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import {
  clearRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from './refresh-cookie.js';

function configWith(values: Partial<Env>): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

function mockResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('refresh cookie', () => {
  const config = configWith({ COOKIE_SECURE: true, COOKIE_SAMESITE: 'strict' });

  it('sets an httpOnly cookie scoped to the auth endpoints', () => {
    const res = mockResponse();
    const expiresAt = new Date('2030-01-01T00:00:00Z');

    setRefreshCookie(res, 'token-value', expiresAt, config);

    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'token-value', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
      expires: expiresAt,
    });
  });

  it('clears the cookie with the same path and flags', () => {
    const res = mockResponse();

    clearRefreshCookie(
      res,
      configWith({ COOKIE_SECURE: false, COOKIE_SAMESITE: 'lax' }),
    );

    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
    });
  });
});
