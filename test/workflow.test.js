import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  authorizeDeletionAfterOpen,
  createKeyboardPauseController,
  runDeletionLoop,
} from '../src/workflow.js';

test('abre a pagina antes de pedir autorizacao para apagar', async () => {
  const events = [];

  const authorized = await authorizeDeletionAfterOpen({
    limit: 20,
    openCommentsPage: async () => events.push('pagina aberta'),
    ask: async () => {
      events.push('autorizacao pedida');
      return 'APAGAR';
    },
  });

  assert.deepEqual(events, ['pagina aberta', 'autorizacao pedida']);
  assert.equal(authorized, true);
});

test('cancela quando a confirmacao nao for APAGAR', async () => {
  const authorized = await authorizeDeletionAfterOpen({
    limit: 20,
    openCommentsPage: async () => {},
    ask: async () => 'cancelar',
  });

  assert.equal(authorized, false);
});

test('aceita apagar em letras minusculas', async () => {
  const authorized = await authorizeDeletionAfterOpen({
    limit: 20,
    openCommentsPage: async () => {},
    ask: async () => 'apagar',
  });

  assert.equal(authorized, true);
});

test('repete lotes de 20 ate a lista ficar vazia', async () => {
  const results = [
    { selected: 20, deleted: true, empty: false },
    { selected: 20, deleted: true, empty: false },
    { selected: 7, deleted: true, empty: false },
    { selected: 0, deleted: false, empty: true },
  ];

  const summary = await runDeletionLoop({
    runBatch: async () => results.shift(),
  });

  assert.deepEqual(summary, { batches: 3, totalDeleted: 47 });
});

test('aguarda retomada antes de iniciar o proximo lote', async () => {
  let paused = false;
  let resumePause;
  const calls = [];
  const pauseController = {
    waitIfPaused: async () => {
      if (!paused) return;
      await new Promise((resolve) => {
        resumePause = resolve;
      });
    },
  };

  const loop = runDeletionLoop({
    pauseController,
    runBatch: async () => {
      calls.push('lote');
      if (calls.length === 1) return { selected: 20, deleted: true, empty: false };
      return { selected: 0, deleted: false, empty: true };
    },
    afterDeletedBatch: async () => {
      paused = true;
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['lote']);

  paused = false;
  resumePause();
  const summary = await loop;

  assert.deepEqual(calls, ['lote', 'lote']);
  assert.deepEqual(summary, { batches: 1, totalDeleted: 20 });
});

test('pausa com espaco e retoma com enter', async () => {
  const input = new EventEmitter();
  const messages = [];
  let rawMode = false;
  input.isTTY = true;
  input.isRaw = false;
  input.resume = () => {};
  input.setRawMode = (enabled) => {
    rawMode = enabled;
    input.isRaw = enabled;
  };

  const controller = createKeyboardPauseController({
    input,
    output: { write: (message) => messages.push(message) },
    onCancel: () => {},
  });

  controller.start();
  input.emit('data', Buffer.from(' '));

  let resumed = false;
  const waiting = controller.waitIfPaused().then(() => {
    resumed = true;
  });
  await Promise.resolve();

  assert.equal(rawMode, true);
  assert.equal(controller.isPaused(), true);
  assert.equal(resumed, false);

  input.emit('data', Buffer.from('\r'));
  await waiting;

  assert.equal(controller.isPaused(), false);
  assert.equal(resumed, true);
  assert.match(messages.join(''), /pausado/i);
  assert.match(messages.join(''), /retomando/i);

  controller.stop();
  assert.equal(rawMode, false);
});
