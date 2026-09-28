import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { Env } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import {
  type AuthResponse,
  type AuthResult,
  AuthService,
} from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  clearRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from './refresh-cookie.js';

const CREDENTIALS_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REFRESH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.register(dto));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(CREDENTIALS_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(dto));
  }

  /** Uses the refresh cookie, so it works after the access token expired. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle(REFRESH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = this.readRefreshCookie(req);
    try {
      if (!token) throw new UnauthorizedException();
      return this.respond(res, await this.auth.refresh(token));
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        clearRefreshCookie(res, this.config);
      }
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = this.readRefreshCookie(req);
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res, this.config);
  }

  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    const found = await this.users.findById(user.sub);
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  private readRefreshCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private respond(
    res: Response,
    { refresh, ...body }: AuthResult,
  ): AuthResponse {
    setRefreshCookie(res, refresh.token, refresh.expiresAt, this.config);
    return body;
  }
}
