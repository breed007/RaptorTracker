const { expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const OWNER = { username: 'owner', password: 'e2e-password-long-enough' };

async function signIn(page) {
  await page.goto('/');
  if (await page.getByLabel('Username').isVisible().catch(() => false)) {
    await page.getByLabel('Username').fill(OWNER.username);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
  }
}

/** WCAG 2.1 AA, as the Phase 7 audit ran it. Fails with the rule and the elements. */
async function expectAccessible(page, label) {
  // Let transitions finish so contrast is measured on final colors.
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = results.violations.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  expect(problems, `accessibility problems on ${label}`).toEqual([]);
}

module.exports = { OWNER, signIn, expectAccessible };
