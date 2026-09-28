import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import type { Env } from '../config/env.js';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { type Url, urls } from '../database/schema.js';
import type { CreateUrlDto } from './dto/create-url.dto.js';
import type { ListUrlsQuery } from './dto/list-urls.query.js';
import type { UpdateUrlDto } from './dto/update-url.dto.js';
import type {
  PaginatedUrlsDto,
  UrlResponseDto,
} from './dto/url-response.dto.js';
import { generateShortCode, RESERVED_CODES } from './short-code.js';

export const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class UrlsService {
  private readonly shortUrlBase: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    config: ConfigService<Env, true>,
  ) {
    this.shortUrlBase = config.get('SHORT_URL_BASE');
  }

  async create(userId: string, dto: CreateUrlDto): Promise<UrlResponseDto> {
    if (dto.alias && RESERVED_CODES.has(dto.alias.toLowerCase())) {
      throw new BadRequestException(`Alias "${dto.alias}" is reserved`);
    }

    const attempts = dto.alias ? 1 : MAX_CODE_ATTEMPTS;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const [url] = await this.db
          .insert(urls)
          .values({
            userId,
            code: dto.alias ?? generateShortCode(),
            originalUrl: dto.url,
            expiresAt: dto.expiresAt,
          })
          .returning();
        return this.toResponse(url);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (dto.alias) {
          throw new ConflictException(`Alias "${dto.alias}" is already taken`);
        }
      }
    }
    throw new InternalServerErrorException('Could not generate a unique code');
  }

  async list(
    userId: string,
    { page, limit, search }: ListUrlsQuery,
  ): Promise<PaginatedUrlsDto> {
    const conditions: SQL[] = [eq(urls.userId, userId)];
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        or(ilike(urls.originalUrl, pattern), ilike(urls.code, pattern))!,
      );
    }
    const where = and(...conditions);

    const [items, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(urls)
        .where(where)
        .orderBy(desc(urls.createdAt), desc(urls.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ total: count() }).from(urls).where(where),
    ]);

    return {
      items: items.map((url) => this.toResponse(url)),
      total,
      page,
      limit,
    };
  }

  async findOne(userId: string, id: number): Promise<UrlResponseDto> {
    return this.toResponse(await this.findOwned(userId, id));
  }

  async update(
    userId: string,
    id: number,
    dto: UpdateUrlDto,
  ): Promise<UrlResponseDto> {
    if (dto.url === undefined && dto.expiresAt === undefined) {
      return this.findOne(userId, id);
    }
    const [url] = await this.db
      .update(urls)
      .set({ originalUrl: dto.url, expiresAt: dto.expiresAt })
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning();
    if (!url) throw new NotFoundException('URL not found');
    return this.toResponse(url);
  }

  async remove(userId: string, id: number): Promise<void> {
    const deleted = await this.db
      .delete(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning({ id: urls.id });
    if (deleted.length === 0) throw new NotFoundException('URL not found');
  }

  /** Resolves a public short code; throws 404 if unknown and 410 if expired. */
  async resolve(code: string): Promise<Pick<Url, 'id' | 'originalUrl'>> {
    const [url] = await this.db
      .select({
        id: urls.id,
        originalUrl: urls.originalUrl,
        expiresAt: urls.expiresAt,
      })
      .from(urls)
      .where(eq(urls.code, code));
    if (!url) throw new NotFoundException('Short URL not found');
    if (url.expiresAt && url.expiresAt <= new Date()) {
      throw new GoneException('Short URL has expired');
    }
    return { id: url.id, originalUrl: url.originalUrl };
  }

  private async findOwned(userId: string, id: number): Promise<Url> {
    const [url] = await this.db
      .select()
      .from(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)));
    if (!url) throw new NotFoundException('URL not found');
    return url;
  }

  private toResponse({ userId: _userId, ...url }: Url): UrlResponseDto {
    return { ...url, shortUrl: `${this.shortUrlBase}/${url.code}` };
  }
}
