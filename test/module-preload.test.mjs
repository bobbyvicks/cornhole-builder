import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The head of index.html names every module the page runs, so the browser
   fetches them all alongside app.mjs instead of finding the ones in lib/
   only once app.mjs has arrived and been read. A module added to the
   imports and left out of the list would quietly bring that second round
   trip back, and a link to a module nothing imports downloads for
   nothing, so the two must match exactly. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/* The modules a file imports, as paths from the site's root. Only static
   imports with a relative path are followed; the page has no others. */
function importsOf(file) {
  const out = [];
  for (const m of read(file).matchAll(/^\s*import\s[^;]*?\sfrom\s*['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    out.push(relative(ROOT, normalize(join(ROOT, dirname(file), m[1]))).split('\\').join('/'));
  }
  return out;
}
/* app.mjs and everything it reaches. */
function moduleGraph(entry) {
  const seen = new Set([entry]), queue = [entry];
  while (queue.length) for (const dep of importsOf(queue.shift())) if (!seen.has(dep)) { seen.add(dep); queue.push(dep); }
  return seen;
}
const html = read('index.html');
const head = html.slice(0, html.indexOf('</head>'));
const preloads = [...head.matchAll(/<link\s+rel="modulepreload"\s+href="([^"]+)">/g)].map((m) => m[1]);

test('the page runs app.mjs as its one module script', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(scripts, ['<script type="module" src="app.mjs">']);
});

test('the head preloads exactly the modules app.mjs imports, and app.mjs itself', () => {
  const imported = importsOf('app.mjs');
  assert.ok(imported.length >= 9, 'the import lines were read: ' + imported.join(', '));
  assert.deepEqual([...preloads].sort(), [...moduleGraph('app.mjs')].sort());
  assert.equal(new Set(preloads).size, preloads.length, 'no module is listed twice');
  assert.equal(preloads[0], 'app.mjs', 'the module that runs is asked for first');
  assert.equal(html.split('rel="modulepreload"').length - 1, preloads.length, 'every preload link is in the head');
});

test('every preloaded module is a file that exists', () => {
  for (const href of preloads) assert.doesNotThrow(() => read(href), href);
});
