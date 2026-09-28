import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { refreshTokens } from '../database/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

type Executor = Pick<Database, 'insert'>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);
  private readonly ttlMs: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get<number>('REFRESH_TOKEN_TTL_DAYS') * DAY_MS;
  }

  /** Starts a new session (token family) unless `familyId` is given. */
  async issue(
    userId: string,
    familyId: string = randomUUID(),
    executor: Executor = this.db,
  ): Promise<IssuedRefreshToken> {
    // 256 bits of entropy, so a fast hash is enough to store it.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await executor.insert(refreshTokens).values({
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt,
    });
    return { token, expiresAt };
  }

  /**
   * Exchanges a valid refresh token for a new one in the same family.
   * Presenting an already-rotated token revokes the whole family, since it
   * means the token was copied (or two refreshes raced).
   */
  async rotate(
    token: string,
  ): Promise<IssuedRefreshToken & { userId: string }> {
    const [stored] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(token)));
    if (!stored) throw new UnauthorizedException();

    if (stored.revokedAt) {
      await this.revokeFamilyById(stored.familyId);
      this.logger.warn(
        `Refresh token reuse detected; revoked session family ${stored.familyId} of user ${stored.userId}`,
      );
      throw new UnauthorizedException();
    }
    if (stored.expiresAt <= new Date()) throw new UnauthorizedException();

    const issued = await this.db.transaction(async (tx) => {
      // Conditional update: only one concurrent request can consume the token.
      const consumed = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)),
        )
        .returning({ id: refreshTokens.id });
      if (consumed.length === 0) return null;
      return this.issue(stored.userId, stored.familyId, tx);
    });

    if (!issued) {
      await this.revokeFamilyById(stored.familyId);
      this.logger.warn(
        `Concurrent refresh detected; revoked session family ${stored.familyId} of user ${stored.userId}`,
      );
      throw new UnauthorizedException();
    }
    return { ...issued, userId: stored.userId };
  }

  /** Ends the session the token belongs to. Unknown tokens are ignored. */
  async revokeFamily(token: string): Promise<void> {
    const [stored] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(token)));
    if (stored) await this.revokeFamilyById(stored.familyId);
  }

  async deleteExpired(userId: string): Promise<void> {
    await this.db
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          lte(refreshTokens.expiresAt, new Date()),
        ),
      );
  }

  private async revokeFamilyById(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }
}
