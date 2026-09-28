import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.js';
import { createOpenApiDocument } from './openapi.js';

/** Shared by main.ts and the e2e tests so both run the same HTTP setup. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Needed to read the refresh token cookie.
  app.use(cookieParser());
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
    // Lets the Angular app send the refresh cookie (withCredentials: true).
    credentials: true,
  });
  // Take the client IP from X-Forwarded-For when running behind one proxy.
  app.set('trust proxy', 1);

  // Interactive docs at /api/docs (JSON at /api/docs-json), outside production only.
  if (config.get<Env['NODE_ENV']>('NODE_ENV') !== 'production') {
    SwaggerModule.setup('api/docs', app, () => createOpenApiDocument(app));
  }
}
