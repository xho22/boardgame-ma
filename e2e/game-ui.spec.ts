import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test("shows racer card images in catalog, selection, and current turn", async ({ page }) => {
  await page.getByRole("button", { name: "Racers" }).click();

  await expect(page.getByRole("heading", { name: "Racers" })).toBeVisible();
  await expect(page.getByRole("img", { name: "炼金师" })).toBeVisible();
  await expect(page.getByText("main move 掷出 1 或 2 时，可以改为移动 4 格。")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "New Game" }).click();
  await page.getByRole("button", { name: "Start Game" }).click();

  const firstTeamRacer = page.locator(".racer-card").first();
  await expect(firstTeamRacer.locator("img")).toBeVisible();
  await expect(firstTeamRacer.locator(".racer-ability")).toBeHidden();
  await firstTeamRacer.hover();
  await expect(firstTeamRacer.locator(".racer-ability")).toBeVisible();

  await page.getByRole("button", { name: "Choose Racers" }).click();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await page.getByRole("button", { name: "Choose Racers" }).click();

  const firstSelectableRacer = page.locator(".selectable-racer").first();
  await expect(firstSelectableRacer.locator("img")).toBeVisible();
  await expect(firstSelectableRacer.locator("p")).toHaveText(/.+/);

  await firstSelectableRacer.click();
  await page.getByRole("button", { name: "Lock Choice" }).click();

  const secondSelectableRacer = page.locator(".selectable-racer").first();
  await expect(secondSelectableRacer.locator("img")).toBeVisible();
  await expect(secondSelectableRacer.locator("p")).toHaveText(/.+/);

  await secondSelectableRacer.click();
  await page.getByRole("button", { name: "Lock Choice" }).click();
  await page.getByRole("button", { name: "Start Race" }).click();

  await expect(page.getByRole("heading", { name: "Track" })).toBeVisible();
  await expect(page.locator(".current-racer-image")).toBeVisible();
  await expect(page.locator(".current-racer-copy").locator("p").last()).toHaveText(/.+/);
});
