import type { Page } from "@playwright/test";

export async function noHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Download the React DevTools|favicon/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

export async function firstQuestionHref(page: Page, query: string): Promise<string> {
  await page.goto(`/explore?q=${encodeURIComponent(query)}`);
  const href = await page.locator('a[href^="/questions/"]').first().getAttribute("href");
  if (!href) throw new Error(`No question found for "${query}"`);
  return href;
}
