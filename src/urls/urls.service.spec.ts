import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { Database } from '../database/database.module.js';
import type { Url } from '../database/schema.js';
import { MAX_CODE_ATTEMPTS, UrlsService } from './urls.service.js';

const uniqueViolation = Object.assign(new Error('Failed query'), {
  cause: { code: '23505' },
});

function makeUrl(values: Partial<Url>): Url {
  return {
    id: 1,
    userId: 'user-1',
    code: 'abc1234',
    originalUrl: 'https://example.com',
    clicks: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    ...values,
  };
}

describe('UrlsService.create', () => {
  let returning: ReturnType<typeof vi.fn>;
  let values: ReturnType<typeof vi.fn>;
  let service: UrlsService;

  beforeEach(() => {
    returning = vi.fn();
    values = vi.fn(() => ({ returning }));
    const db = { insert: vi.fn(() => ({ values })) } as unknown as Database;
    const config = {
      get: () => 'https://sho.rt',
    } as unknown as ConfigService<Env, true>;
    service = new UrlsService(db, config);
  });

  it('returns the short URL without exposing the owner', async () => {
    returning.mockResolvedValueOnce([makeUrl({ code: 'xyz7890' })]);

    const result = await service.create('user-1', {
      url: 'https://example.com',
    });

    expect(result.shortUrl).toBe('https://sho.rt/xyz7890');
    expect(result).not.toHaveProperty('userId');
  });

  it('retries with a new code when the generated one collides', async () => {
    returning
      .mockRejectedValueOnce(uniqueViolation)
      .mockResolvedValueOnce([makeUrl({})]);

    await service.create('user-1', { url: 'https://example.com' });

    expect(values).toHaveBeenCalledTimes(2);
    const [first, second] = values.mock.calls.map(
      ([arg]: [{ code: string }]) => arg.code,
    );
    expect(first).not.toBe(second);
  });

  it(`gives up after ${MAX_CODE_ATTEMPTS} collisions`, async () => {
    returning.mockRejectedValue(uniqueViolation);

    await expect(
      service.create('user-1', { url: 'https://example.com' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(values).toHaveBeenCalledTimes(MAX_CODE_ATTEMPTS);
  });

  it('returns 409 without retrying when a custom alias is taken', async () => {
    returning.mockRejectedValue(uniqueViolation);

    await expect(
      service.create('user-1', { url: 'https://example.com', alias: 'taken' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(values).toHaveBeenCalledTimes(1);
  });

  it('rejects reserved aliases regardless of case', async () => {
    await expect(
      service.create('user-1', { url: 'https://example.com', alias: 'Health' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(values).not.toHaveBeenCalled();
  });

  it('propagates unrelated database errors', async () => {
    returning.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      service.create('user-1', { url: 'https://example.com' }),
    ).rejects.toThrow('connection lost');
  });
});
