import { test, expect } from '@playwright/test';

test('word order setting persists (§4.4)', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('单词出现顺序').selectOption('shuffle');

  // Wait until the IndexedDB write has landed before reloading.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open('word-pocket');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          return new Promise<string | undefined>((resolve) => {
            const get = db.transaction('settings', 'readonly').objectStore('settings').get('app');
            get.onsuccess = () => resolve((get.result as { wordOrder?: string } | undefined)?.wordOrder);
          });
        }),
      { timeout: 10_000 },
    )
    .toBe('shuffle');

  await page.reload();
  await expect(page.getByLabel('单词出现顺序')).toHaveValue('shuffle');
});

test('Collins key section is present and safe without a proxy (§5.4)', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Collins API Key' })).toBeVisible();
  await expect(page.getByLabel('Collins API Key')).toHaveAttribute('type', 'password');
  // No key saved and no proxy in the E2E environment → cannot test yet.
  await expect(page.getByRole('button', { name: '测试连接' })).toBeDisabled();
  // The key field is empty and masked; no secret is rendered.
  await expect(page.getByLabel('Collins API Key')).toHaveValue('');
  await expect(page.getByRole('button', { name: '应用' })).toBeDisabled();
});
