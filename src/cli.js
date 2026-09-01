import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright-core';
import { parseArgs } from './config.js';
import {
  authorizeDeletionAfterOpen,
  createKeyboardPauseController,
  runDeletionLoop,
} from './workflow.js';
import {
  COMMENTS_URL,
  clickDeleteAndConfirm,
  clickSelectMode,
  detectCommentsState,
  humanPause,
  selectUpTo,
} from './instagram.js';

const profileDirectory = fileURLToPath(new URL('../.instagram-profile/', import.meta.url));
const diagnosticsDirectory = fileURLToPath(new URL('../diagnostics/', import.meta.url));

async function ask(question) {
  const terminal = createInterface({ input, output });
  try {
    return (await terminal.question(question)).trim();
  } finally {
    terminal.close();
  }
}

async function ensureLoggedIn(page, headless) {
  const needsLogin = page.url().includes('/accounts/login/')
    || await page.locator('input[name="password"]').isVisible().catch(() => false);

  if (!needsLogin) return;
  if (headless) {
    throw new Error('Sessao nao autenticada. Execute uma vez sem --headless e faca login.');
  }

  console.log('\n[login] Faca login na janela do Edge. O bot nao le nem salva sua senha.');
  await ask('[login] Quando a pagina inicial do Instagram aparecer, pressione ENTER aqui... ');
  await page.goto(COMMENTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  if (page.url().includes('/accounts/login/')) {
    throw new Error('O Instagram ainda esta na pagina de login.');
  }
}

async function hardReload(page) {
  console.log('[recuperacao] Enviando Ctrl+F5 e aguardando a pagina...');
  await page.keyboard.press('Control+F5');
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await humanPause(page, 2_500, 4_000);
}

async function saveDiagnostic(page, attempt) {
  await mkdir(diagnosticsDirectory, { recursive: true });
  const path = `${diagnosticsDirectory}erro-tentativa-${attempt}.png`;
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  console.log(`[diagnostico] Captura salva em: ${path}`);
}

const noPauseController = { waitIfPaused: async () => {} };

function createPauseAwareDelay(pauseController) {
  return async (page, minimumMs, maximumMs) => {
    await pauseController.waitIfPaused();
    await humanPause(page, minimumMs, maximumMs);
    await pauseController.waitIfPaused();
  };
}

async function executeBatch(
  page,
  config,
  pageAlreadyOpen = false,
  pause = humanPause,
  pauseController = noPauseController,
) {
  await pauseController.waitIfPaused();

  if (!pageAlreadyOpen) {
    await page.goto(COMMENTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await ensureLoggedIn(page, config.headless);
  }

  await pauseController.waitIfPaused();

  if (await detectCommentsState(page) === 'empty') {
    return { selected: 0, deleted: false, empty: true };
  }

  await clickSelectMode(page, pause);
  await pauseController.waitIfPaused();

  const selected = await selectUpTo(page, config.limit, pause);
  if (selected === 0) {
    throw new Error('Nenhum checkbox de comentario foi encontrado.');
  }

  await pauseController.waitIfPaused();

  if (config.dryRun) {
    console.log(`[dry-run] ${selected} comentario(s) selecionado(s); nada foi apagado.`);
    if (!config.headless) await ask('[dry-run] Confira a janela e pressione ENTER para fechar... ');
    return { selected, deleted: false, empty: false };
  }

  console.log(`[exclusao] Confirmando a exclusao de ${selected} comentario(s)...`);
  await clickDeleteAndConfirm(page, pause);
  console.log(`[lote concluido] O Instagram recebeu a exclusao de ${selected} comentario(s).`);
  return { selected, deleted: true, empty: false };
}

async function executeWithRetries(
  page,
  config,
  firstAttemptAlreadyOpen = false,
  pause = humanPause,
  pauseController = noPauseController,
) {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      console.log(`\n[tentativa] ${attempt}/${config.maxAttempts}`);
      return await executeBatch(
        page,
        config,
        attempt === 1 && firstAttemptAlreadyOpen,
        pause,
        pauseController,
      );
    } catch (error) {
      console.error(`[erro] ${error.message}`);
      await saveDiagnostic(page, attempt);

      if (attempt === config.maxAttempts) throw error;
      await hardReload(page);
    }
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));

  console.log('Instagram Comment Cleaner');
  console.log(`Modo: ${config.dryRun ? 'teste sem apagar' : 'exclusao'} | limite: ${config.limit}`);

  await mkdir(profileDirectory, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDirectory, {
    channel: 'msedge',
    headless: config.headless,
    viewport: config.headless ? { width: 1366, height: 900 } : null,
    args: config.headless ? [] : ['--start-maximized'],
  });

  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(20_000);
  const pauseController = createKeyboardPauseController({ input, output });
  const pauseAwareDelay = createPauseAwareDelay(pauseController);

  try {
    let firstAttemptAlreadyOpen = false;
    if (!config.dryRun) {
      const authorized = await authorizeDeletionAfterOpen({
        limit: config.limit,
        ask,
        openCommentsPage: async () => {
          await page.goto(COMMENTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await ensureLoggedIn(page, config.headless);
        },
      });
      if (!authorized) {
        console.log('Operacao cancelada.');
        return;
      }
      pauseController.start();
      firstAttemptAlreadyOpen = true;
    }

    let useAlreadyOpenPage = firstAttemptAlreadyOpen;
    const summary = await runDeletionLoop({
      runBatch: async ({ batchNumber, totalDeleted }) => {
        console.log(`\n[lote] ${batchNumber} | total anterior: ${totalDeleted}`);
        const result = await executeWithRetries(
          page,
          config,
          useAlreadyOpenPage,
          pauseAwareDelay,
          pauseController,
        );
        useAlreadyOpenPage = false;
        return result;
      },
      pauseController,
      afterDeletedBatch: async ({ batches, totalDeleted }) => {
        console.log(`[progresso] ${batches} lote(s), ${totalDeleted} comentario(s) excluido(s).`);
        await pauseAwareDelay(page, 2_500, 4_500);
      },
    });

    if (!config.dryRun) {
      console.log(
        `[finalizado] Nao ha mais comentarios. Total excluido: ${summary.totalDeleted} em ${summary.batches} lote(s).`,
      );
    }
  } finally {
    pauseController.stop();
    await context.close();
  }
}

main().catch((error) => {
  console.error(`\n[fatal] ${error.message}`);
  process.exitCode = 1;
});
