import { test, expect } from '@playwright/test';
import { importSample } from './helpers';

test('first run → import → study three branches (§12.6)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/study');
  await expect(page.getByText('还没有可学习的单词')).toBeVisible({ timeout: 20_000 });

  await importSample(page);

  await page.goto('/study');
  await expect(page.getByTestId('study-word')).toBeVisible();

  // Branch 1: direct remember → answer → confirm → completed.
  await page.getByRole('button', { name: /^记得/ }).click();
  await expect(page.getByText('看完了，继续')).toBeVisible();
  await page.getByRole('button', { name: /看完了，继续/ }).click();
  await page.getByRole('button', { name: '下一个' }).click();

  // Branch 2: forget → hint → remember → answer → confirm.
  await page.getByRole('button', { name: /^不记得/ }).click();
  await expect(page.getByText('语境提示')).toBeVisible();
  await page.getByRole('button', { name: /^记得/ }).click();
  await page.getByRole('button', { name: /看完了，继续/ }).click();
  await page.getByRole('button', { name: '下一个' }).click();

  // Branch 3: forget → hint → forget → queued.
  await page.getByRole('button', { name: /^不记得/ }).click();
  await page.getByRole('button', { name: /^不记得/ }).click();
  await page.getByRole('button', { name: /看完了，继续/ }).click();
  await expect(page.getByText('已加入当天强化队列')).toBeVisible();
});

test('reload restores in-progress state (§12.6)', async ({ page }) => {
  test.setTimeout(90_000);
  await importSample(page);
  await page.goto('/study');
  await page.getByRole('button', { name: /^不记得/ }).click();
  await expect(page.getByText('语境提示')).toBeVisible();
  await page.reload();
  await expect(page.getByText('语境提示')).toBeVisible({ timeout: 15_000 });
});

test('statistics render after reviews (§12.6)', async ({ page }) => {
  test.setTimeout(90_000);
  await importSample(page);
  await page.goto('/study');
  await page.getByRole('button', { name: /^记得/ }).click();
  await page.getByRole('button', { name: /看完了，继续/ }).click();
  await page.goto('/stats');
  await expect(page.getByText('首次回忆成功率')).toBeVisible();
});

test('narrow window keeps buttons visible (§12.6)', async ({ page }) => {
  test.setTimeout(90_000);
  await importSample(page);
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto('/study');
  await expect(page.getByRole('button', { name: /^记得/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^不记得/ })).toBeVisible();
});
