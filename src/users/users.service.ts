import { Inject, Injectable } from '@nestjs/common';
import { eq, getTableColumns } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { type NewUser, type User, users } from '../database/schema.js';
import type { PublicUserDto } from './dto/public-user.dto.js';

export type PublicUser = PublicUserDto;

const { passwordHash: _passwordHash, ...publicColumns } =
  getTableColumns(users);

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Includes the password hash; only for credential checks. */
  async findByEmailWithPassword(email: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async findById(id: string): Promise<PublicUser | undefined> {
    const [user] = await this.db
      .select(publicColumns)
      .from(users)
      .where(eq(users.id, id));
    return user;
  }

  /** Throws a unique violation if the email is already registered. */
  async create(data: NewUser): Promise<PublicUser> {
    const [user] = await this.db
      .insert(users)
      .values({ ...data, email: data.email.toLowerCase() })
      .returning(publicColumns);
    return user;
  }
}
