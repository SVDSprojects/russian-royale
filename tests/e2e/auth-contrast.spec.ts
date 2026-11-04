import { test, expect } from '@playwright/test';
test('registration stays readable when dark theme was saved', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('rr-preferences', JSON.stringify({ theme: 'dark', notifications: true })),
  );
  await page.route('**/api/auth/status', (r) =>
    r.fulfill({ json: { emailCodesEnabled: true, emailCodesRequired: true, smsEnabled: false } }),
  );
  await page.goto('/#home');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const form = page.locator('form.rr-auth-form');
  await expect(form).toBeVisible();
  expect(await form.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await page.getByLabel('Электронная почта').evaluate((e) => getComputedStyle(e).color)).toBe(
    'rgb(23, 38, 66)',
  );
  await page.screenshot({ path: 'artifacts/auth-readable-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Вход', exact: true }).click();
  await page.getByRole('button', { name: 'Забыли пароль?' }).click();
  await expect(page.getByRole('heading', { name: 'Восстановить доступ' })).toBeVisible();
  await expect(page.getByLabel('Код из письма')).toBeVisible();
});
