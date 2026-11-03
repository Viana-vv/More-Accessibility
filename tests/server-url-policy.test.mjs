import test from 'node:test';
import assert from 'node:assert/strict';
import { UrlPolicyError, validateExternalUrl } from '../src/server/url-policy.ts';

test('aceita apenas URL HTTP(S) pública', async () => {
  await assert.rejects(() => validateExternalUrl('file:///etc/passwd'), UrlPolicyError);
  await assert.rejects(() => validateExternalUrl('javascript:alert(1)'), UrlPolicyError);
  await assert.rejects(() => validateExternalUrl('http://127.0.0.1:8080'), UrlPolicyError);
  await assert.rejects(() => validateExternalUrl('http://169.254.169.254/latest/meta-data'), UrlPolicyError);
  await assert.rejects(() => validateExternalUrl('http://user:pass@example.com'), UrlPolicyError);
});

test('bloqueia nomes reservados antes da resolução DNS', async () => {
  await assert.rejects(() => validateExternalUrl('http://localhost/'), /Destino local/);
  await assert.rejects(() => validateExternalUrl('http://metadata.google.internal/'), /Destino local/);
});

test('rejeita entradas excessivamente longas', async () => {
  await assert.rejects(() => validateExternalUrl(`https://${'a'.repeat(2048)}.example/`), /2048/);
});

