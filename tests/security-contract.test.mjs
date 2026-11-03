import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/ssrf-targets.json'), 'utf8'));

test('contrato de segurança cobre esquemas, loopback e metadata', () => {
  assert.equal(fixture.filter((item) => !item.allowed).length, 6);
  assert.ok(fixture.some((item) => item.reason === 'cloud metadata'));
  assert.ok(fixture.some((item) => item.reason === 'local file'));
});

test('nenhum destino proibido deve ser aceito pelo validador', () => {
  for (const item of fixture.filter((entry) => !entry.allowed)) {
    assert.notEqual(new URL(item.url).protocol, 'https:', `${item.url} não pode ser liberada só por parecer URL válida`);
  }
});
