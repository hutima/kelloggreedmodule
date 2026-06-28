import { writeFileSync, mkdirSync } from 'node:fs';
import { sampleDocuments } from '../src/fixtures/index.ts';
import { layoutDocument } from '../src/domain/layout/index.ts';
import { layoutToSvg } from '../src/domain/render/index.ts';

const out = '/tmp/claude-0/-home-user-kelloggreedmodule/55f64d75-3c3f-52f5-836c-d7ca1eab56e0/scratchpad/samples';
mkdirSync(out, { recursive: true });

for (const doc of sampleDocuments) {
  const svg = layoutToSvg(layoutDocument(doc, doc.layoutHints), {
    padding: 16,
    background: true,
    standalone: true,
  });
  writeFileSync(`${out}/${doc.id}.svg`, svg);
  console.log(doc.id, '→ ok');
}
