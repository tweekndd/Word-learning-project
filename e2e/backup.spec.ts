import { test, expect } from '@playwright/test';
import { importSample } from './helpers';

test('export → clear → restore round-trip (§12.6)', async ({ page }) => {
  test.setTimeout(120_000);
  await importSample(page);

  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON（不含词典缓存）' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await page.getByRole('button', { name: '清空学习数据' }).click();
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: '确认清空' }).click(),
  ]);
  await page.goto('/vocabulary');
  await expect(page.getByText('词库为空')).toBeVisible({ timeout: 15_000 });

  await page.goto('/settings');
  await page.setInputFiles('input[type=file]', backupPath!);
  await expect(page.getByText('确认恢复备份')).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: '完全替换' }).click(),
  ]);

  await page.goto('/vocabulary');
  await expect(page.getByText('词库为空')).toHaveCount(0);
  await page.goto('/study');
  await expect(page.getByTestId('study-word')).toBeVisible({ timeout: 15_000 });
});

test('study works without a live API (§12.6)', async ({ page }) => {
  await importSample(page);
  await page.goto('/study');
  await expect(page.getByTestId('study-word')).toBeVisible();
  // The mock provider is fully offline; a hint appearing proves study does not
  // depend on a reachable dictionary service.
  await page.getByRole('button', { name: /^不记得/ }).click();
  await expect(page.getByText('语境提示')).toBeVisible();
});

test('theme and layout modes apply and persist (§12.6)', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('主题').selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByLabel('布局模式').selectOption('compact');
  await expect(page.getByText('紧凑模式')).toBeVisible();

  await page.getByLabel('布局模式').selectOption('standard');
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('every route renders on an empty database (§12.6)', async ({ page }) => {
  test.setTimeout(60_000);
  for (const path of ['/study', '/vocabulary', '/review', '/difficult', '/stats', '/settings']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
  }
  await page.goto('/study');
  await expect(page.getByText('还没有可学习的单词')).toBeVisible({ timeout: 15_000 });
});
