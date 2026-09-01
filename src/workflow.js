export async function authorizeDeletionAfterOpen({
  limit,
  openCommentsPage,
  ask,
}) {
  await openCommentsPage();
  const confirmation = await ask(
    `Digite APAGAR para autorizar a exclusao de ate ${limit} comentarios: `,
  );
  return confirmation.trim().toLocaleUpperCase('pt-BR') === 'APAGAR';
}

const TOGGLE_KEYS = new Set([' ', '\r', '\n']);

export function createKeyboardPauseController({
  input,
  output,
  onCancel = () => process.kill(process.pid, 'SIGINT'),
}) {
  let paused = false;
  let started = false;
  let previousRawMode = false;
  const waiters = [];

  const resumeWaiters = () => {
    while (waiters.length > 0) {
      waiters.shift()();
    }
  };

  const write = (message) => {
    if (output?.write) output.write(message);
  };

  const onData = (chunk) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);

    if (text.includes('\u0003')) {
      onCancel();
      return;
    }

    if (![...text].some((character) => TOGGLE_KEYS.has(character))) return;

    paused = !paused;
    if (paused) {
      write('\n[pausado] Pressione ENTER ou ESPACO para retomar.\n');
      return;
    }

    write('\n[retomando] Continuando...\n');
    resumeWaiters();
  };

  return {
    start() {
      if (started) return;
      started = true;

      if (!input?.isTTY || typeof input.setRawMode !== 'function') {
        write('\n[controle] Pausa por teclado indisponivel neste terminal.\n');
        return;
      }

      previousRawMode = Boolean(input.isRaw);
      input.setRawMode(true);
      input.resume();
      input.on('data', onData);
      write('\n[controle] ENTER ou ESPACO pausa/retoma. Ctrl+C encerra.\n');
    },

    stop() {
      if (!started) return;
      started = false;
      input?.off?.('data', onData);
      if (input?.isTTY && typeof input.setRawMode === 'function') {
        input.setRawMode(previousRawMode);
      }
      paused = false;
      resumeWaiters();
    },

    isPaused() {
      return paused;
    },

    async waitIfPaused() {
      if (!paused) return;
      await new Promise((resolve) => waiters.push(resolve));
    },
  };
}

export async function runDeletionLoop({
  runBatch,
  afterDeletedBatch = async () => {},
  pauseController = { waitIfPaused: async () => {} },
}) {
  let batches = 0;
  let totalDeleted = 0;

  while (true) {
    await pauseController.waitIfPaused();
    const result = await runBatch({ batchNumber: batches + 1, totalDeleted });
    if (result.empty || result.selected === 0 || !result.deleted) {
      return { batches, totalDeleted };
    }

    batches += 1;
    totalDeleted += result.selected;
    await afterDeletedBatch({ batches, totalDeleted, selected: result.selected });
  }
}
