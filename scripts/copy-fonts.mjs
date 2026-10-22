import { mkdirSync, copyFileSync } from 'node:fs';
const src = 'node_modules/@fontsource-variable/bricolage-grotesque/files/';
mkdirSync('public/fonts', { recursive: true });
for (const f of ['latin', 'latin-ext'])
  copyFileSync(`${src}bricolage-grotesque-${f}-wdth-normal.woff2`, `public/fonts/bricolage-${f}.woff2`);
