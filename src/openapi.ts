import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { REFRESH_COOKIE } from './auth/refresh-cookie.js';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('URL Shortener API')
    .setDescription(
      'API for the URL shortener dashboard. Short links are served by `GET /{code}` ' +
        'on the short-link domain and are not part of this document.',
    )
    .setVersion('0.1.0')
    .addServer('http://localhost:3000', 'Local development')
    .addBearerAuth()
    .addCookieAuth(
      REFRESH_COOKIE,
      { type: 'apiKey', in: 'cookie' },
      'refresh-cookie',
    )
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}
