export const COMMENTS_URL = 'https://www.instagram.com/your_activity/interactions/comments/';

const SELECT_BUTTON_NAME = /^(Select|Selecionar)$/i;
const CHECKBOX_SELECTOR = '[data-testid="bulk_action_checkbox"] [role="button"][aria-label="Toggle checkbox"]';
const RECOVERABLE_DELETE_ERROR_TEXT =
  /Something went wrong|There was a problem deleting some or all of your content|Algo deu errado|Houve um problema ao excluir/i;

function recoverableDeleteErrorDialog(page) {
  return page.getByRole('dialog').filter({ hasText: RECOVERABLE_DELETE_ERROR_TEXT });
}

export async function throwIfRecoverableInstagramError(page) {
  const dialog = recoverableDeleteErrorDialog(page).first();
  if (!(await dialog.isVisible().catch(() => false))) return;

  const okButton = dialog.getByRole('button', { name: /^(OK|Ok|Okay|Tudo bem)$/i });
  if (await okButton.first().isVisible().catch(() => false)) {
    await clickInteractive(okButton);
  }

  throw new Error('Instagram informou falha ao excluir. Atualizando a pagina e tentando novamente.');
}

export async function detectCommentsState(page, timeoutMs = 15_000) {
  const nonEmptyContainer = page.locator('[data-testid="comments_container_non_empty_state"]');
  const emptyContainer = page.locator('[data-testid="comments_container_empty_state"]');
  const emptyText = page.getByText(
    /^(No comments|Nenhum coment[aá]rio|You haven't made any comments.*)$/i,
  );
  const selectText = page.getByText(SELECT_BUTTON_NAME, { exact: true });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await throwIfRecoverableInstagramError(page);

    if (await selectText.last().isVisible().catch(() => false)
      || await nonEmptyContainer.isVisible().catch(() => false)) {
      return 'non-empty';
    }
    if (await emptyContainer.isVisible().catch(() => false)
      || await emptyText.last().isVisible().catch(() => false)) {
      return 'empty';
    }
    await page.waitForTimeout(250);
  }

  throw new Error('Nao foi possivel determinar se ainda existem comentarios.');
}

export async function humanPause(page, minimumMs = 900, maximumMs = 1700) {
  const duration = Math.floor(minimumMs + Math.random() * (maximumMs - minimumMs + 1));
  await page.waitForTimeout(duration);
}

async function clickInteractive(locator) {
  const count = await locator.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;

    const pointerEvents = await candidate.evaluate((element) => getComputedStyle(element).pointerEvents);
    if (pointerEvents === 'none') {
      await candidate.dispatchEvent('click');
    } else {
      await candidate.click({ timeout: 5_000 });
    }
    return;
  }

  throw new Error('Botao visivel e interativo nao encontrado.');
}

async function selectionWasConfirmed(page, checkbox, expectedCount) {
  const selectedText = page.getByText(new RegExp(`^${expectedCount}\\s+selected$`, 'i'), {
    exact: true,
  });

  for (let check = 0; check < 4; check += 1) {
    const counterConfirmed = await selectedText.last().isVisible().catch(() => false);
    const iconConfirmed = await checkbox.locator('[style*="circle-check__filled"]').count() > 0;
    if (counterConfirmed || iconConfirmed) return true;
    await page.waitForTimeout(100);
  }

  return false;
}

async function clickCheckboxAndConfirm(page, checkbox, expectedCount) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await clickInteractive(checkbox);
    if (await selectionWasConfirmed(page, checkbox, expectedCount)) return;
    console.warn(`[selecao] Clique ${attempt} nao confirmado; tentando novamente...`);
  }

  throw new Error(`O Instagram nao confirmou a selecao ${expectedCount}.`);
}

export async function clickSelectMode(page, pause = humanPause) {
  const selectButton = page.getByRole('button', { name: SELECT_BUTTON_NAME });
  const selectText = page.getByText(SELECT_BUTTON_NAME, { exact: true });
  const selectTrigger = selectButton.or(selectText);
  await selectTrigger.first().waitFor({ state: 'visible', timeout: 20_000 });
  await clickInteractive(selectTrigger);
  await pause(page, 800, 1_400);
}

export async function selectUpTo(page, limit, pause = humanPause) {
  const checkboxes = page.locator(CHECKBOX_SELECTOR);
  let selected = 0;
  let unchangedScrolls = 0;
  let previousCount = -1;

  while (selected < limit && unchangedScrolls < 5) {
    const count = await checkboxes.count();

    for (let index = 0; index < count && selected < limit; index += 1) {
      const checkbox = checkboxes.nth(index);
      const isNew = await checkbox.evaluate((element) => {
        if (element.dataset.igCleanerSeen === '1') return false;
        element.dataset.igCleanerSeen = '1';
        return true;
      }).catch(() => false);

      if (!isNew) continue;

      await checkbox.scrollIntoViewIfNeeded();
      await clickCheckboxAndConfirm(page, checkbox, selected + 1);
      selected += 1;
      console.log(`[selecao confirmada] ${selected}/${limit}`);
      await pause(page, 300, 650);
    }

    if (selected >= limit) break;

    if (count === previousCount) unchangedScrolls += 1;
    else unchangedScrolls = 0;
    previousCount = count;

    if (count > 0) await checkboxes.last().scrollIntoViewIfNeeded().catch(() => {});
    await page.mouse.wheel(0, 900);
    await pause(page, 700, 1_200);
  }

  return selected;
}

export async function clickDeleteAndConfirm(page, pause = humanPause) {
  const deleteName = /^(Delete|Excluir)$/i;
  await clickInteractive(page.getByRole('button', { name: deleteName }));
  await pause(page, 1_000, 1_800);

  const dialog = page.getByRole('dialog').filter({
    hasText: /Delete comments\?|Excluir coment[aá]rios\?|Are you sure you want to delete these comments\?/i,
  });
  const confirmationText = page.getByText(
    /Delete comments\?|Excluir coment[aá]rios\?|Are you sure you want to delete these comments\?|Delete \d+ comments|Excluir \d+ coment[aá]rios/i,
  );
  await dialog.or(confirmationText).first().waitFor({ state: 'visible', timeout: 10_000 });

  const confirmationButtons = dialog.first().getByRole('button', { name: deleteName });
  await confirmationButtons.first().waitFor({ state: 'visible', timeout: 10_000 });
  await clickInteractive(confirmationButtons);

  for (let check = 0; check < 40; check += 1) {
    await throwIfRecoverableInstagramError(page);
    if (!(await dialog.first().isVisible().catch(() => false))) return;
    await page.waitForTimeout(250);
  }

  throw new Error('O dialogo de exclusao nao fechou apos confirmar.');
}
