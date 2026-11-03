import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'src/ui/index.html'), 'utf8');
const css = await readFile(resolve(root, 'src/ui/styles.css'), 'utf8');

test('interface possui navegação semântica, formulário e logo acessível', () => {
  assert.match(html, /<main id="main-content">/);
  assert.match(html, /<nav class="primary-nav" aria-label="Navegação principal">/);
  assert.match(html, /<input id="target-url"[^>]+type="url"/);
  assert.match(html, /<img [^>]*alt="Logo de olho estilizado/);
  assert.doesNotMatch(html, /aria-label="Notificações"|aria-label="Perfil"/);
  assert.match(html, /id="rule-results"/);
  assert.match(html, /id="image-results"/);
});

test('interface inclui foco visível e layout responsivo', () => {
  assert.match(css, /:focus-visible\{/);
  assert.match(css, /@media \(max-width:760px\)/);
});

test('interface prevê detalhe por ocorrência, comparação e cópia', async () => {
  const app = await readFile(resolve(root, 'src/ui/app.js'), 'utf8');
  const resultsCss = await readFile(resolve(root, 'src/ui/results.css'), 'utf8');
  assert.match(html, /<details class="criterion-item">/);
  assert.match(app, /occurrenceId/);
  assert.match(app, /correctedHtml/);
  assert.match(app, /navigator\.clipboard\.writeText/);
  assert.match(app, /captureBlocked/);
  assert.match(resultsCss, /\.comparison-grid/);
});
