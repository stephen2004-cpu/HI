// Lossless pixel crops from the user-approved Concept 02 board, never a redraw.
// Regeneration only requires ImageMagick 7 (`magick`); normal app builds do not.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = `${root}LBD_GO_Infographic_va_Prompt.png`;
const expected =
  'e44df742b4b72ae5314e634dcb2a67dceff4613db5208329abe76f9765998270';
if (
  createHash('sha256').update(readFileSync(source)).digest('hex') !== expected
)
  throw Error(
    'Brand board changed; inspect the original image and reapprove crop bounds before generating.',
  );
mkdirSync(`${root}public/brand`, { recursive: true });
mkdirSync(`${root}public/icons`, { recursive: true });
const run = (...args) => execFileSync('magick', args, { stdio: 'pipe' });
for (const [file, geometry] of [
  ['falcon-mark.png', '365x310+372+85'],
  ['falcon-favicon-source.png', '140x140+905+667'],
  ['falcon-app-source.png', '256x256+844+172'],
])
  run(
    source,
    '-crop',
    geometry,
    '+repage',
    '-define',
    'png:exclude-chunk=time,date',
    `${root}public/brand/${file}`,
  );
for (const size of [16, 32, 48])
  run(
    `${root}public/brand/falcon-favicon-source.png`,
    '-filter',
    'Lanczos',
    '-resize',
    `${size}x${size}`,
    '-define',
    'png:exclude-chunk=time,date',
    `${root}public/icons/favicon-${size}.png`,
  );
run(
  `${root}public/icons/favicon-16.png`,
  `${root}public/icons/favicon-32.png`,
  `${root}public/icons/favicon-48.png`,
  `${root}public/favicon.ico`,
);
for (const [file, size] of [
  ['apple-touch-icon.png', 180],
  ['app-icon-192.png', 192],
  ['app-icon-512.png', 512],
])
  run(
    `${root}public/brand/falcon-app-source.png`,
    '-filter',
    'Lanczos',
    '-resize',
    `${size}x${size}`,
    '-define',
    'png:exclude-chunk=time,date',
    `${root}public/icons/${file}`,
  );
console.log('Concept 02 assets extracted from the approved original board.');
