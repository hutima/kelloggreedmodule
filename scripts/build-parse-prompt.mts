import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildParsePrompt } from '../src/domain/prompt.ts';

// Regenerates docs/parse-prompt.txt (the {{SENTENCE}}/{{LANGUAGE}} template)
// from the same builder the in-app "Copy parse prompt" button uses.
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../docs/parse-prompt.txt');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buildParsePrompt());
console.log('Wrote', out);
