import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isUniqueViolation } from '../common/db-errors.js';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';
import type { Env } from '../config/env.js';
import { type PublicUser, UsersService } from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  type IssuedRefreshToken,
  RefreshTokensService,
} from './refresh-tokens.service.js';

/** Body returned to the client; the refresh token travels in a cookie. */
export interface AuthResponse {
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: PublicUser;
}

export interface AuthResult extends AuthResponse {
  refresh: IssuedRefreshToken;
}

// Compared against when the email does not exist, so both paths take similar time.
const DUMMY_HASH = await hashPassword('dummy-password-for-timing');

@Injectable()
export class AuthService {
  private readonly accessTokenTtl: number;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTokenTtl = config.get<number>('JWT_EXPIRES_IN');
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    let user: PublicUser;
    try {
      user = await this.users.create({
        email: dto.email,
        name: dto.name,
        passwordHash: await hashPassword(dto.password),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
    return this.buildResult(user, await this.refreshTokens.issue(user.id));
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { passwordHash: _passwordHash, ...publicUser } = user;
    await this.refreshTokens.deleteExpired(user.id);
    return this.buildResult(
      publicUser,
      await this.refreshTokens.issue(user.id),
    );
  }

  async refresh(token: string): Promise<AuthResult> {
    const { userId, ...refresh } = await this.refreshTokens.rotate(token);
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.buildResult(user, refresh);
  }

  async logout(token: string): Promise<void> {
    await this.refreshTokens.revokeFamily(token);
  }

  private async buildResult(
    user: PublicUser,
    refresh: IssuedRefreshToken,
  ): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.accessTokenTtl,
      user,
      refresh,
    };
  }
}
