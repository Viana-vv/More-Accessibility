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
  assert.match(html, /id="result-filters"/);
  assert.match(html, /id="summary-violations"/);
  assert.match(html, /id="summary-reviews"/);
  assert.match(html, /id="summary-passes"/);
  assert.match(html, /id="summary-images"/);
  assert.doesNotMatch(html, /class="result-icon"/);
  assert.match(html, /id="detail-modal"/);
  assert.doesNotMatch(html, /class="feature-grid"/);
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
  assert.match(app, /localStorage/);
  assert.match(app, /Informativa/);
  assert.match(app, /Funcional/);
  assert.match(app, /Escape/);
  assert.match(app, /currentResults = results\.filter/);
});

test('refinamento visual remove a faixa estrutural e mantém a home editorial', async () => {
  const overrides = await readFile(resolve(root, 'src/ui/analysis-overrides.css'), 'utf8');
  assert.doesNotMatch(html, /class="feature-grid"/);
  assert.match(html, /src="\/logo\.png"/);
  assert.doesNotMatch(overrides, /overflow-x:\s*hidden/);
  assert.match(overrides, /background: var\(--bg\)/);
  assert.match(overrides, /min-height: calc\(100svh - 72px\)/);
});

test('estados compactos têm wrapping e foco de modal responsivo', async () => {
  const overrides = await readFile(resolve(root, 'src/ui/analysis-overrides.css'), 'utf8');
  assert.match(overrides, /overflow-wrap: anywhere/);
  assert.match(overrides, /dialog::backdrop/);
  assert.match(overrides, /dialog:focus-visible/);
  assert.match(overrides, /@media \(max-width: 760px\)/);
});
