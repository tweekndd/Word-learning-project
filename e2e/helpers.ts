import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const sampleCsv = resolve(here, '..', 'samples', 'business_english.csv');

export async function importSample(page: Page): Promise<void> {
  await page.goto('/vocabulary');
  await page.setInputFiles('input[type=file]', sampleCsv);
  await expect(page.getByText(/有效/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '确认导入' }).click();
  await expect(page.getByText('导入完成')).toBeVisible({ timeout: 20_000 });
}

export async function clearIndexedDb(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise<void>((res) => {
            if (!d.name) return res();
            const req = indexedDB.deleteDatabase(d.name);
            req.onsuccess = req.onerror = req.onblocked = () => res();
          }),
      ),
    );
  });
}
