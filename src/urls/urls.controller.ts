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
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { CreateUrlDto } from './dto/create-url.dto.js';
import { ListUrlsQuery } from './dto/list-urls.query.js';
import { UpdateUrlDto } from './dto/update-url.dto.js';
import { UrlsService } from './urls.service.js';

@Controller('urls')
export class UrlsController {
  constructor(private readonly urls: UrlsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUrlDto) {
    return this.urls.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListUrlsQuery) {
    return this.urls.list(user.sub, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urls.findOne(user.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUrlDto,
  ) {
    return this.urls.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.urls.remove(user.sub, id);
  }
}
