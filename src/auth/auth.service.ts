import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUniqueViolation } from '../common/db-errors.js';
import type { JwtPayload } from '../common/decorators/current-user.decorator.js';
import { type PublicUser, UsersService } from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { hashPassword, verifyPassword } from './password.js';

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

// Compared against when the email does not exist, so both paths take similar time.
const DUMMY_HASH = await hashPassword('dummy-password-for-timing');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    try {
      const user = await this.users.create({
        email: dto.email,
        name: dto.name,
        passwordHash: await hashPassword(dto.password),
      });
      return this.buildResponse(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return this.buildResponse(publicUser);
  }

  private async buildResponse(user: PublicUser): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return { accessToken: await this.jwt.signAsync(payload), user };
  }
}
