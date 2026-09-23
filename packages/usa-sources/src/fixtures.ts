import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Reads a committed fixture from src/fixtures as parsed JSON. */
export function readFixtureJson(filename: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/fixtures', filename), 'utf8'));
}

/** Reads a committed fixture from src/fixtures as raw text. */
export function readFixtureText(filename: string): string {
  return readFileSync(path.join(process.cwd(), 'src/fixtures', filename), 'utf8');
}
