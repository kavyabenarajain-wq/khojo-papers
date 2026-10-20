import { expect, test } from "@playwright/test";
import { collectErrors, firstQuestionHref, noHorizontalOverflow } from "./helpers";

test.use({ viewport: { width: 375, height: 812 } });

test("find a question with search and filters", async ({ page }) => {
  await page.goto("/explore");
  await page.getByRole("button", { name: /Filters/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filter questions" });
  await dialog.getByLabel("Chapter").selectOption("circles");
  await dialog.getByRole("button", { name: "Show results" }).click();
  await expect(page).toHaveURL(/chapter=circles/);
  await expect(page.locator("#results-heading")).toContainText(/\d+ question/);
  const cards = page.locator("article");
  expect(await cards.count()).toBeGreaterThan(0);
  for (const c of await cards.all()) await expect(c).toContainText("Circles");

  await page.getByLabel("Search questions").fill("no-such-topic-xyz");
  await page.getByLabel("Search questions").press("Enter");
  await expect(page.getByText("No questions match these filters")).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/explore$/);
});

test("answer a multiple-choice question without an account and see the marking", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(await firstQuestionHref(page, "SGST"));
  await expect(page.getByText("KHOJO original").first()).toBeVisible();
  await expect(page.getByText(/Original practice question written for KHOJO PAPERS/)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("\\(");

  await page.getByRole("radio").first().check();
  await expect(page.getByText(/Draft kept on this device/)).toBeVisible();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.locator("p", { hasText: /^(Correct|Not quite)/ })).toBeVisible();
  await expect(page.getByText("Checked against the verified answer key.")).toBeVisible();
  await expect(page.getByText(/Sign in.*to save your answers/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("reveal a solution and step through the whiteboard", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(await firstQuestionHref(page, "cyclic quadrilateral"));
  // Maths is typeset (KaTeX with MathML for screen readers), never shown as raw LaTeX.
  expect(await page.locator(".katex math").count()).toBeGreaterThan(0);
  await expect(page.locator("main")).not.toContainText("\\angle");
  // The question figure is drawn, with a text description for screen readers.
  await expect(page.locator("figure svg[role=img]").first()).toBeVisible();
  await page.getByText("Text description of the figure").first().click();

  await page.getByRole("button", { name: "Reveal solution" }).click();
  // Revealing before attempting asks for confirmation.
  await page.getByRole("dialog").getByRole("button", { name: "Reveal solution" }).click();
  const board = page.getByRole("region", { name: "Worked solution" });
  await expect(board).toBeVisible();
  await expect(board.getByText(/^1 \/ \d+$/)).toBeVisible();
  await board.getByRole("button", { name: "Next step" }).click();
  await expect(board.getByText(/^2 \/ \d+$/)).toBeVisible();
  await board.getByRole("button", { name: "Previous step" }).click();
  await expect(board.getByText(/^1 \/ \d+$/)).toBeVisible();
  await board.getByRole("button", { name: "Show all steps" }).click();
  await expect(board.getByRole("button", { name: "Next step" })).toBeDisabled();
  await board.getByRole("button", { name: "Restart explanation" }).click();
  await expect(board.getByText(/^1 \/ \d+$/)).toBeVisible();
  await board.getByRole("tab", { name: "All steps as text" }).click();
  await expect(board.getByText("Step 1", { exact: false }).first()).toBeVisible();
  await expect(board.getByText("Final answer")).toBeVisible();
  await board.getByRole("button", { name: "Hide solution" }).click();
  await expect(board).toBeHidden();
  expect(await noHorizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("signed-in features explain what's needed instead of failing", async ({ page }) => {
  await page.goto("/progress");
  await expect(page.getByText("Sign in to track your progress")).toBeVisible();
  await page.goto("/papers/practice-set-algebra-1");
  await expect(page.getByRole("link", { name: "Sign in to take this paper" })).toBeVisible();
  await expect(page.getByText(/not a CISCE paper/).first()).toBeVisible();
  await page.goto("/examiner");
  await expect(page.getByText(/isn.t available on this server yet/)).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)admin/);
});

test("the timed paper structure shows the any-N rule", async ({ page }) => {
  await page.goto("/papers/practice-set-algebra-1");
  await expect(page.getByText("Answer any 3 of 4")).toBeVisible();
  await expect(page.getByText("45 minutes")).toBeVisible();
  await page.getByRole("link", { name: "Read the paper" }).click();
  await expect(page.getByText("Question 9")).toBeVisible();
});
