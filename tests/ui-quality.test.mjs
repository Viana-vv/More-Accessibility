import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let html = '';
let css = '';
try {
  html = await readFile(resolve('src/ui/index.html'), 'utf8');
  css = await readFile(resolve('src/ui/styles.css'), 'utf8');
} catch {
  // The first test below reports the missing UI artifact as a QA failure.
}

test('entrega a página principal e a folha de estilos da UI', async () => {
  assert.notEqual(html, '', 'src/ui/index.html ausente ou ilegível');
  assert.notEqual(css, '', 'src/ui/styles.css ausente ou ilegível');
});

test('UI mantém estrutura navegável e controles nomeados', () => {
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /href="#main-content">/);
  assert.match(html, /<main id="main-content">/);
  assert.match(html, /<nav[^>]+aria-label=/);
  assert.match(html, /<form[^>]+id="scan-form"/);
  assert.match(html, /<label[^>]+for="target-url"/);
  assert.match(html, /<input id="target-url"[^>]+required/);
  assert.match(html, /<button[^>]*type="submit"[^>]*>[\s\S]*<span>Iniciar/);
});

test('UI declara foco visível, contraste por tokens e layout responsivo', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline/);
  assert.match(css, /--text:\s*#[0-9a-f]{6}/i);
  assert.match(css, /--muted:\s*#[0-9a-f]{6}/i);
  assert.match(css, /@media\s*\(max-width:760px\)/);
});

test('ícones SVG decorativos não entram na árvore acessível', () => {
  const svgCount = (html.match(/<svg\b/g) ?? []).length;
  const hiddenCount = (html.match(/<svg[^>]+aria-hidden="true"/g) ?? []).length;
  const decorativeImages = [...html.matchAll(/<img[^>]+src="\/icons\/[^\"]+"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(hiddenCount, svgCount);
  assert.ok(decorativeImages.length > 0);
  assert.ok(decorativeImages.every((tag) => /alt=""/.test(tag) && /aria-hidden="true"/.test(tag)));
});
