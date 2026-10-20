import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const page = await readFile('public/index.html', 'utf8');
const bootstrap = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!bootstrap) throw new Error('Theme bootstrap script was not found in public/index.html');
const digest = createHash('sha256').update(bootstrap).digest('base64');
const replacement = `sha256-${digest}`;
for (const file of ['public/_headers', 'functions/_middleware.ts']) {
  const content = await readFile(file, 'utf8');
  await writeFile(file, content.replace(/sha256-[^' ;]+/g, replacement));
}
console.log(`Updated CSP theme bootstrap hash: ${replacement}`);
