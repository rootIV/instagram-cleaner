import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/config.js';

test('usa modo visivel, limite 20 e tres tentativas por padrao', () => {
  assert.deepEqual(parseArgs([]), {
    dryRun: false,
    headless: false,
    limit: 20,
    maxAttempts: 3,
  });
});

test('aceita dry-run e headless', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--headless']), {
    dryRun: true,
    headless: true,
    limit: 20,
    maxAttempts: 3,
  });
});

test('nunca permite selecionar mais de 20 comentarios', () => {
  assert.throws(() => parseArgs(['--limit', '21']), /entre 1 e 20/);
});

test('rejeita argumentos desconhecidos', () => {
  assert.throws(() => parseArgs(['--rapido']), /Argumento desconhecido/);
});
