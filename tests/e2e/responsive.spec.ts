import { expect, test } from "@playwright/test";
import { collectErrors, firstQuestionHref, noHorizontalOverflow } from "./helpers";

const WIDTHS = [320, 375, 390, 430, 768, 1280];

test.describe("responsive layout", () => {
  let questionHref = "";
  let diagramQuestionHref = "";

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    questionHref = await firstQuestionHref(page, "SGST");
    diagramQuestionHref = await firstQuestionHref(page, "cyclic quadrilateral");
    await page.close();
  });

  for (const width of WIDTHS) {
    test(`no horizontal overflow or console errors at ${width}px`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width, height: 900 });
      const paths = ["/", "/explore", "/explore?chapter=circles", questionHref, diagramQuestionHref, "/papers", "/papers/practice-set-algebra-1", "/papers/practice-set-algebra-1?view=paper", "/examiner", "/progress", "/about", "/privacy", "/login", "/signup", "/forgot-password"];
      for (const path of paths) {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        expect(await page.locator("h1").count(), `${path} has a heading`).toBeGreaterThan(0);
        expect(await noHorizontalOverflow(page), `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
      }
      expect(errors).toEqual([]);
    });
  }

  for (const width of [320, 375]) {
    test(`touch targets are at least 44px on phones (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(questionHref);
      const tabs = page.getByRole("navigation", { name: "Main" }).last().getByRole("link");
      for (const tab of await tabs.all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const name of ["Check answer", "Reveal solution"]) {
        const box = await page.getByRole("button", { name }).boundingBox();
        expect(box!.height, name).toBeGreaterThanOrEqual(44);
      }
      const options = page.getByRole("radio");
      for (const opt of await options.all()) {
        const label = opt.locator("xpath=ancestor::label");
        expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
