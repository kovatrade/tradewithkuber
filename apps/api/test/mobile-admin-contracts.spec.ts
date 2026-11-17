import 'reflect-metadata';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { parse, validate } from 'graphql';

/** Build the real API schema without starting services, connecting to a database or executing mutations. */
describe('native administration API contracts', () => {
  it('validates every native admin operation against the API schema', async () => {
    const resolvers: Function[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.resolver.ts')) {
          for (const [name, value] of Object.entries(require(path)))
            if (name.endsWith('Resolver') && typeof value === 'function') resolvers.push(value);
        }
      }
    };
    walk(resolve(__dirname, '../src'));
    const app = await NestFactory.createApplicationContext(GraphQLSchemaBuilderModule, { logger: false });
    try {
      const schema = await app.get(GraphQLSchemaFactory).create(resolvers);
      const source = readFileSync(resolve(__dirname, '../../mobile/src/admin-tools.tsx'), 'utf8');
      const activity = readFileSync(resolve(__dirname, '../../mobile/src/activity.ts'), 'utf8').match(
        /ACTIVITY_FIELDS\s*=\s*'([^']+)'/,
      )![1];
      const login = readFileSync(resolve(__dirname, '../../mobile/src/activity.ts'), 'utf8').match(
        /LOGIN_FIELDS\s*=\s*'([^']+)'/,
      )![1];
      const consent = readFileSync(resolve(__dirname, '../../mobile/src/activity.ts'), 'utf8').match(
        /CONSENT_FIELDS\s*=\s*'([^']+)'/,
      )![1];
      const version = source.match(/const V = '([^']+)'/)![1];
      let count = 0;
      for (const match of source.matchAll(/`([^`]+)`/g)) {
        const query = match[1]
          .replace(/\$\{ACTIVITY_FIELDS\}/g, activity)
          .replace(/\$\{V\}/g, version)
          .replace(/\$\{LOGIN_FIELDS\}/g, login)
          .replace(/\$\{CONSENT_FIELDS\}/g, consent);
        if (!/^(\{|query\(|mutation)/.test(query)) continue;
        const errors = validate(schema, parse(query));
        expect({ query, errors: errors.map((e) => e.message) }).toEqual({ query, errors: [] });
        count++;
      }
      expect(count).toBeGreaterThanOrEqual(20);
    } finally {
      await app.close();
    }
  });
});
