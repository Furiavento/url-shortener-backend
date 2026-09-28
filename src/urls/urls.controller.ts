import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { CreateUrlDto } from './dto/create-url.dto.js';
import { ListUrlsQuery } from './dto/list-urls.query.js';
import { UpdateUrlDto } from './dto/update-url.dto.js';
import { PaginatedUrlsDto, UrlResponseDto } from './dto/url-response.dto.js';
import { UrlsService } from './urls.service.js';

@ApiTags('urls')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('urls')
export class UrlsController {
  constructor(private readonly urls: UrlsService) {}

  /** Creates a short URL. Without `alias`, a random 7-character code is generated. */
  @ApiBadRequestResponse({ description: 'Invalid body or reserved alias' })
  @ApiConflictResponse({ description: 'Alias already taken' })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateUrlDto,
  ): Promise<UrlResponseDto> {
    return this.urls.create(user.sub, dto);
  }

  /** Lists the user's URLs, newest first. */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListUrlsQuery,
  ): Promise<PaginatedUrlsDto> {
    return this.urls.list(user.sub, query);
  }

  /** Gets one of the user's URLs. */
  @ApiNotFoundResponse({
    description: 'URL not found or not owned by the user',
  })
  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UrlResponseDto> {
    return this.urls.findOne(user.sub, id);
  }

  /** Updates the destination or expiration. The short code cannot change. */
  @ApiNotFoundResponse({
    description: 'URL not found or not owned by the user',
  })
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUrlDto,
  ): Promise<UrlResponseDto> {
    return this.urls.update(user.sub, id, dto);
  }

  /** Deletes the URL and its click history. */
  @ApiNotFoundResponse({
    description: 'URL not found or not owned by the user',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.urls.remove(user.sub, id);
  }
}
