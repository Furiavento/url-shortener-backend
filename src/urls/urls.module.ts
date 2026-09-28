import { Module } from '@nestjs/common';
import { UrlsController } from './urls.controller.js';
import { UrlsService } from './urls.service.js';

@Module({
  controllers: [UrlsController],
  providers: [UrlsService],
  exports: [UrlsService],
})
export class UrlsModule {}
