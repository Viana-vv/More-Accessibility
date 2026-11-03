import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'src/ui/index.html'), 'utf8');
const css = await readFile(resolve(root, 'src/ui/styles.css'), 'utf8');

test('interface has semantic navigation, URL form and accessible logo', () => {
  assert.match(html, /<main id="main-content">/);
  assert.match(html, /<nav class="primary-nav" aria-label="Navegação principal">/);
  assert.match(html, /<input id="target-url"[^>]+type="url"/);
  assert.match(html, /<img [^>]*alt="Logo de olho estilizado/);
  assert.match(html, /aria-live="polite"/);
});

test('interface includes a visible keyboard focus treatment and responsive layout', () => {
  assert.match(css, /:focus-visible\{/);
  assert.match(css, /@media \(max-width:760px\)/);
});
