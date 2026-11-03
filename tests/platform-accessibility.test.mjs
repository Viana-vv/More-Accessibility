import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/platform-shell.html'), 'utf8');

test('shell da plataforma tem idioma, skip link e landmark principal', () => {
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /href="#main">Pular para o conteúdo/);
  assert.match(html, /<main id="main">/);
});

test('shell possui navegação, título único e formulário rotulado', () => {
  assert.match(html, /<nav aria-label="Principal"/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<label for="url">URL da página<\/label>/);
  assert.match(html, /<input id="url" name="url" type="url" required>/);
  assert.match(html, /<button type="submit">Analisar URL<\/button>/);
});

test('shell declara indicador de foco visível', () => {
  assert.match(html, /:focus-visible\{[^}]*outline:/);
});
