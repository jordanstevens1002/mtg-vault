import { expect, test } from '@playwright/test';

test('Plains browsing, physical allocation and import preview work together', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const initial = await (await request.get('/api/v1/summary')).json();
  await page.goto('/?scope=catalogue&q=Plains');
  await expect(page.getByRole('heading', { name: 'Plains', exact: true })).toHaveCount(1);
  await page.getByRole('heading', { name: 'Plains', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('10');
  await page.getByRole('button', { name: 'Confirm and add copies' }).click();
  await expect(page.getByRole('status')).toContainText('Copies added');
  await expect.poll(async () => (await (await request.get('/api/v1/summary')).json()).owned).toBe(initial.owned + 10);
  await page.getByRole('link', { name: 'Decks', exact: true }).click();
  const name = `Smoke deck ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Deck name', exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('casual');
  await page.getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name, exact: true }).click();
  await page.getByRole('textbox', { name: 'Find a card' }).fill('Plains');
  await page.getByRole('button', { name: 'Plains', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Add to plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3 × Plains' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Use copies' }).first().fill('3');
  await page.getByRole('button', { name: 'Confirm all copies and build' }).click();
  await expect(page.getByRole('heading', { name: 'Return this deck to storage' })).toBeVisible();
  await expect
    .poll(async () => (await (await request.get('/api/v1/summary')).json()).in_decks)
    .toBe(initial.in_decks + 3);
  await page.goto('/?q=Plains');
  await expect(page.getByRole('progressbar').first()).toHaveAttribute('value', String(initial.in_decks + 3));
  await page.getByRole('link', { name: 'Import Export' }).click();
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('decklist');
  await page.getByRole('textbox', { name: 'Or paste content' }).fill('[mainboard]\n2 Plains\n1 A Missing Card');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByText('Line 3:', { exact: false })).toContainText('Unresolved');
  await expect(page.getByRole('button', { name: 'Confirm creating this planned deck' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/portability-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?q=Plains');
  await expect(page.getByRole('heading', { name: 'Plains', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/library-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('local OCR recognises a captured frame and requires confirmation', async ({ page, request }) => {
  const externalRequests: string[] = [];
  page.on('request', (req) => {
    if (
      !req.url().startsWith(new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080').origin) &&
      !req.url().startsWith('blob:') &&
      !req.url().startsWith('data:')
    )
      externalRequests.push(req.url());
  });
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 960;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#181818';
    context.fillRect(0, 0, 1280, 960);
    const height = 960 * 0.88,
      width = (height * 488) / 680,
      x = (1280 - width) / 2,
      y = (960 - height) / 2;
    context.fillStyle = 'white';
    context.fillRect(x, y, width, height);
    context.fillStyle = 'black';
    context.font = 'bold 44px Arial';
    context.fillText('Plains', x + 25, y + 80);
    context.font = '20px Arial';
    context.fillText('0250 C', x + 20, y + height - 45);
    context.fillText('M21 • EN', x + 20, y + height - 20);
    const stream = canvas.captureStream(5);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => stream });
    window.setInterval(() => {
      context.fillStyle = '#181818';
      context.fillRect(0, 0, 2, 2);
    }, 100);
  });
  const initial = await (await request.get('/api/v1/summary')).json();
  await page.goto('/scan');
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture and recognise' })).toBeEnabled();
  await page.getByRole('button', { name: 'Capture and recognise' }).click();
  await expect(page.getByRole('button', { name: 'Plains', exact: true })).toBeVisible({ timeout: 60000 });
  expect((await (await request.get('/api/v1/summary')).json()).owned).toBe(initial.owned);
  await page.getByRole('button', { name: 'Plains', exact: true }).click();
  await page.getByRole('combobox', { name: 'Confirm printing', exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Confirm and add copies' }).click();
  await expect.poll(async () => (await (await request.get('/api/v1/summary')).json()).owned).toBe(initial.owned + 1);
  expect(externalRequests).toEqual([]);
});

for (const engine of ['tesseract', 'paddle']) {
  test(`${engine} excludes a non-land card's mana cost without saving stock`, async ({ page, request }) => {
    test.setTimeout(180000);
    const external: string[] = [];
    page.on('request', (req) => {
      if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080').origin) external.push(req.url());
    });
    await page.addInitScript(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 960;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#181818'; context.fillRect(0, 0, 1280, 960);
      const height = 960 * 0.88, width = height * 488 / 680;
      const x = (1280 - width) / 2, y = (960 - height) / 2;
      context.fillStyle = '#e7b49e'; context.fillRect(x, y, width, height);
      context.fillStyle = 'black'; context.font = 'bold 38px Arial';
      context.fillText('Lightning Bolt', x + 25, y + 80);
      context.beginPath(); context.arc(x + width - 60, y + 65, 25, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#ddd'; context.font = 'bold 32px Arial';
      context.fillText('1', x + width - 69, y + 76);
      const stream = canvas.captureStream(5);
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => stream });
      window.setInterval(() => { context.fillStyle = '#181818'; context.fillRect(0, 0, 2, 2); }, 100);
    });
    const initial = await (await request.get('/api/v1/summary')).json();
    await page.goto('/scan');
    await page.getByRole('combobox', { name: 'Text recognition' }).selectOption(engine);
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Capture and recognise' })).toBeEnabled();
    await page.getByRole('button', { name: 'Capture and recognise' }).click();
    await Promise.race([
      expect(page.getByRole('textbox', { name: 'Card name' })).toHaveValue('Lightning Bolt', { timeout: 120000 }),
      page.getByRole('alert').waitFor({ timeout: 120000 }).then(async () => { throw new Error(await page.getByRole('alert').innerText()); }),
    ]);
    await page.getByRole('button', { name: 'Lightning Bolt', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Confirm printing' })).toBeVisible();
    expect((await (await request.get('/api/v1/summary')).json()).owned).toBe(initial.owned);
    expect(external).toEqual([]);
  });
}

test('library filter builders keep URL state and dependent subtype options', async ({ page }) => {
  await page.goto('/?scope=catalogue');
  const types = page.getByRole('combobox', { name: 'Card type' });
  await expect(types.getByRole('option', { name: 'Land', exact: true })).toHaveCount(1);
  await types.selectOption('Land');
  const subtypes = page.getByRole('combobox', { name: 'Subtype' });
  await expect(subtypes.getByRole('option', { name: 'Plains', exact: true })).toHaveCount(1);
  await subtypes.selectOption('Plains');
  await expect(page).toHaveURL(/subtype=Plains/);
  await types.selectOption('Instant');
  await expect(page).not.toHaveURL(/subtype=Plains/);
  await expect(subtypes.getByRole('option', { name: 'Plains', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search cards' }).fill('Lightning Bolt');
  await page.getByRole('button', { name: 'Add Red mana', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lightning Bolt', exact: true })).toBeVisible();
  const bookmark = page.url();
  await page.reload();
  await expect(types).toHaveValue('Instant');
  await expect(page.getByRole('button', { name: 'Remove Red mana pip 1' })).toBeVisible();
  await page.getByRole('slider', { name: 'Generic mana' }).focus();
  await page.getByRole('slider', { name: 'Generic mana' }).press('ArrowRight');
  await page.getByRole('slider', { name: 'Generic mana' }).press('ArrowRight');
  await expect(page).not.toHaveURL(bookmark);
  await page.getByRole('button', { name: 'Clear mana cost' }).click();
  await expect(page).not.toHaveURL(/mana_cost=/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?scope=catalogue&q=Plains');
  await expect(page.getByRole('heading', { name: 'Plains', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/library-filters-mobile.png', fullPage: true });
});
