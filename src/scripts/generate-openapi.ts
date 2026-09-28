import { NestFactory } from '@nestjs/core';
import { writeFile } from 'node:fs/promises';
import { AppModule } from '../app.module.js';
import { createOpenApiDocument } from '../openapi.js';

// Writes openapi.json to the project root so the frontend can generate its client.
const output = process.argv[2] ?? 'openapi.json';

const app = await NestFactory.create(AppModule, { logger: ['error'] });
try {
  const document = createOpenApiDocument(app);
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI document written to ${output}`);
} finally {
  await app.close();
}
