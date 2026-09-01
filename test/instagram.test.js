import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import {
  clickDeleteAndConfirm,
  clickSelectMode,
  detectCommentsState,
  selectUpTo,
} from '../src/instagram.js';

async function withPage(run) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  try {
    await run(page);
  } finally {
    await browser.close();
  }
}

test('entra no modo de selecao usando o nome acessivel', async () => {
  await withPage(async (page) => {
    await page.setContent('<button aria-label="Select" onclick="this.dataset.clicked=\'yes\'">Select</button>');
    await clickSelectMode(page, async () => {});
    assert.equal(await page.getByRole('button', { name: 'Select' }).getAttribute('data-clicked'), 'yes');
  });
});

test('entra no modo de selecao quando Select e texto dentro de uma div clicavel', async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div style="pointer-events:auto;cursor:pointer"
           onclick="this.dataset.clicked='yes'">
        <span>Select</span>
      </div>`);

    await clickSelectMode(page, async () => {});

    assert.equal(await page.getByText('Select').locator('..').getAttribute('data-clicked'), 'yes');
  });
});

test('seleciona no maximo 20 checkboxes pelo contrato do HTML anexado', async () => {
  await withPage(async (page) => {
    const rows = Array.from({ length: 25 }, (_, index) => `
      <div style="height:70px">
        <div role="button" aria-label="usuario comentou ${index}">Comentario ${index}</div>
        <div data-testid="bulk_action_checkbox">
          <div role="button" aria-label="Toggle checkbox"
               onclick="
                 this.dataset.selected='yes';
                 this.firstElementChild.style.maskImage='url(circle-check__filled__24-4x.png)';
                 document.querySelector('#counter').textContent=
                   document.querySelectorAll('[data-selected=yes]').length+' selected';">
            <div style="width:24px;height:24px;mask-image:url(circle__outline__24-4x.png)"></div>
          </div>
        </div>
      </div>`).join('');
    await page.setContent(`${rows}<div id="counter">0 selected</div>`);

    const selected = await selectUpTo(page, 20, async () => {});

    assert.equal(selected, 20);
    assert.equal(await page.locator('[data-selected="yes"]').count(), 20);
  });
});

test('repete o clique quando o Instagram nao confirma a selecao', async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div data-testid="bulk_action_checkbox" style="width:48px;height:48px">
        <div role="button" aria-label="Toggle checkbox" style="width:24px;height:24px"
             onclick="
               this.dataset.attempts=Number(this.dataset.attempts||0)+1;
               if(Number(this.dataset.attempts)>=2){
                 this.dataset.selected='yes';
                 this.firstElementChild.style.maskImage='url(circle-check__filled__24-4x.png)';
                 document.querySelector('#counter').textContent='1 selected';
               }">
          <div style="width:24px;height:24px;mask-image:url(circle__outline__24-4x.png)"></div>
        </div>
      </div>
      <div id="counter">0 selected</div>`);

    const selected = await selectUpTo(page, 1, async () => {});

    const checkbox = page.locator('[aria-label="Toggle checkbox"]');
    assert.equal(selected, 1);
    assert.equal(await checkbox.getAttribute('data-attempts'), '2');
    assert.equal(await checkbox.getAttribute('data-selected'), 'yes');
  });
});

test('so confirma a exclusao depois que o dialogo aparece', async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <button aria-label="Delete" onclick="document.querySelector('[role=dialog]').hidden=false">Delete</button>
      <div role="dialog" hidden>
        <p>Delete comments?</p>
        <button aria-label="Delete" onclick="document.body.dataset.confirmed='yes'">Delete</button>
      </div>`);

    await clickDeleteAndConfirm(page, async () => {});

    assert.equal(await page.locator('body').getAttribute('data-confirmed'), 'yes');
  });
});

test('detecta quando ainda existem comentarios', async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div data-testid="comments_container_non_empty_state">
        <span>Select</span>
      </div>`);

    assert.equal(await detectCommentsState(page), 'non-empty');
  });
});

test('detecta quando nao existem mais comentarios', async () => {
  await withPage(async (page) => {
    await page.setContent('<div data-testid="comments_container_empty_state">No comments</div>');

    assert.equal(await detectCommentsState(page), 'empty');
  });
});
