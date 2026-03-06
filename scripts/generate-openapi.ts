/**
 * Generates the OpenAPI spec from the live Fastify app and writes it to
 * api/spec/openapi.yaml. Run via: npm run generate:spec
 */

import { setupApp } from '../src/app.js';
import yaml from 'yaml';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = await setupApp();
await app.ready();

const spec = app.swagger() as { info: { version: string } };
const yamlStr = yaml.stringify(spec);

const specDir = path.join(process.cwd(), 'api', 'spec');
await fs.mkdir(specDir, { recursive: true });
await fs.writeFile(path.join(specDir, 'openapi.yaml'), yamlStr, 'utf-8');

console.log(`OpenAPI spec generated: v${spec.info.version}`);
console.log(`Written to: api/spec/openapi.yaml`);

await app.close();
