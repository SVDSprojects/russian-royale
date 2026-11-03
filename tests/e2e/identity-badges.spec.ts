import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
test('founder and appointed staff have distinct badges and revocation updates the profile', async ({
  page,
  context,
  browser,
}) => {
  const db = new DatabaseSync('data/e2e/royale.sqlite');
  // Repair only a previous fixture whose email was changed by an older test.
  const stale = db
    .prepare(
      "SELECT p.user_id FROM rr_profiles p JOIN users u ON u.id=p.user_id WHERE p.public_id='000001' AND u.email<>'vbarsegan363@gmail.com'",
    )
    .get();
  if (stale) {
    let id = String(111111 + Math.floor(Math.random() * 888889));
    while (db.prepare('SELECT 1 FROM rr_profiles WHERE public_id=?').get(id))
      id = String(111111 + Math.floor(Math.random() * 888889));
    db.prepare('UPDATE rr_profiles SET public_id=? WHERE user_id=?').run(id, stale.user_id);
  }
  const registered = await context.request.post('/api/auth/register', {
    data: { email: 'vbarsegan363@gmail.com', username: 'CEO', password: 'Strong-test-password!' },
  });
  if (!registered.ok())
    expect(
      (
        await context.request.post('/api/auth/login', {
          data: { email: 'vbarsegan363@gmail.com', password: 'Strong-test-password!' },
        })
      ).ok(),
    ).toBeTruthy();
  expect((await context.request.get('/api/social/me')).ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#profile');
  const founder = page.locator('main .badge-founder').first();
  await expect(founder).toBeVisible();
  await expect(founder.locator('.badge-outline')).toHaveAttribute('fill', /^url/);
  await expect(founder.locator('.badge-tick')).toHaveCSS('stroke', 'rgb(255, 255, 255)');
  await expect(page.locator('.social-legend .sdvs-verification svg').first()).toHaveCSS('min-height', '0px');
  await page.screenshot({ path: 'artifacts/founder-badge-phone.png', fullPage: true });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await expect(founder).toBeVisible();
  await page.screenshot({ path: 'artifacts/founder-badge-dark.png', fullPage: true });
  const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const email = randomUUID() + '@badge.test';
    const r = await staffContext.request.post('/api/auth/register', {
      data: { email, username: 'Сотрудник', password: 'Strong-test-password!' },
    });
    expect(r.ok()).toBeTruthy();
    db.prepare("UPDATE users SET role='moderator' WHERE email=?").run(email);
    const staffPage = await staffContext.newPage();
    await staffPage.goto('/#profile');
    const staff = staffPage.locator('main .badge-moderator').first();
    await expect(staff).toBeVisible();
    await expect(staff.locator('.badge-tick')).toHaveCSS('stroke', 'rgb(255, 255, 255)');
    await staffPage.screenshot({ path: 'artifacts/staff-badge-phone.png', fullPage: true });
    await staffPage.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await expect(staff).toBeVisible();
    await staffPage.screenshot({ path: 'artifacts/moderator-badge-dark.png', fullPage: true });
    db.prepare("UPDATE users SET role='player' WHERE email=?").run(email);
    await staffPage.reload();
    await expect(staffPage.locator('main .sdvs-verification')).toHaveCount(0);
  } finally {
    await staffContext.close();
    db.close();
  }
});
