import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RouterModule } from '@nestjs/core';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { RedirectModule } from './redirect/redirect.module.js';
import { UrlsModule } from './urls/urls.module.js';
import { UsersModule } from './users/users.module.js';

// Mounted under /api. RedirectModule stays at the root so short links look like /abc123.
// (A global prefix with `exclude: [':code']` would also exclude every single-segment route.)
const apiModules = [
  AuthModule,
  UsersModule,
  UrlsModule,
  AnalyticsModule,
  HealthModule,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    ...apiModules,
    RouterModule.register([{ path: 'api', children: apiModules }]),
    // Registered last so its catch-all /:code route doesn't shadow anything.
    RedirectModule,
  ],
})
export class AppModule {}
