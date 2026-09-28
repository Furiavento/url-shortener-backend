import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.js';

/** Shared by main.ts and the e2e tests so both run the same HTTP setup. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim()),
  });
  // Take the client IP from X-Forwarded-For when running behind one proxy.
  app.set('trust proxy', 1);
}
