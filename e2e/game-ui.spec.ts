import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

async function fillMastermindPredictions(page: Parameters<typeof test>[0]["page"]) {
  const predictionSelects = page.locator(".prediction-panel select");
  const count = await predictionSelects.count();

  for (let index = 0; index < count; index += 1) {
    const select = predictionSelects.nth(index);
    await select.selectOption({ index: 1 });
  }
}

test("shows racer card images in catalog, selection, and current turn", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "Racers" }).click();

  await expect(page.getByRole("heading", { name: "Racers" })).toBeVisible();
  await expect(page.getByRole("img", { name: "炼金师" })).toBeVisible();
  await expect(page.getByText("主要移动掷出 1 或 2 时，可以改为前进 4 格。")).toBeVisible();
  await expect(page.locator(".catalog-card code")).toHaveCount(0);
  await expect(page.getByText("main_roll_low_becomes_four")).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Local Game" }).click();
  await page.getByRole("button", { name: "Start Game" }).click();

  const firstTeamRacer = page.locator(".racer-card").first();
  await expect(firstTeamRacer.locator("img")).toBeVisible();
  await expect(page.locator(".ability-tooltip")).toBeHidden();
  await firstTeamRacer.hover();
  await expect(page.locator(".ability-tooltip")).toBeVisible();

  await page.getByRole("button", { name: "Randomize Teams" }).click();
  await expect(page.locator(".racer-card")).toHaveCount(8);
  await expect(page.locator(".racer-card").first().locator("img")).toBeVisible();

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
  await fillMastermindPredictions(page);
  await page.getByRole("button", { name: "Start Race" }).click();

  await expect(page.getByRole("heading", { name: "魔法运动会" })).toBeVisible();
  await expect(page.locator(".current-racer-image")).toBeVisible();
  await expect(page.locator(".current-racer-copy").locator("p").last()).toHaveText(/.+/);
  await expect(page.getByLabel("行动顺序")).toBeVisible();
  await expect(page.getByLabel("本局名次积分")).toContainText("第1名 +3分");
  await expect(page.locator(".track-infield")).toBeVisible();
  await expect(page.locator(".current-racer-marker")).toBeVisible();
  await expect(page.locator(".race-board-layout")).toBeVisible();
  await page.locator(".turn-order-item.current").hover();
  await expect(page.locator(".race-sidebar .racer-hover-card")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("race-layout.png"), fullPage: true });
});

test("supports choosing two racers per player in a small game", async ({ page }) => {
  await page.getByRole("button", { name: "Local Game" }).click();
  await page.getByRole("button", { name: "2" }).click();
  await expect(page.getByLabel("Game summary").getByText("8")).toBeVisible();
  await page.getByRole("button", { name: "Start Game" }).click();

  await expect(page.locator(".racer-card")).toHaveCount(16);
  await page.getByRole("button", { name: "Choose Racers" }).click();
  await expect(page.getByText("0 / 2 selected")).toBeVisible();

  await page.locator(".selectable-racer").nth(0).click();
  await page.locator(".selectable-racer").nth(1).click();
  await expect(page.getByText("2 / 2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Lock Choice" }).click();

  await page.locator(".selectable-racer").nth(0).click();
  await page.locator(".selectable-racer").nth(1).click();
  await page.getByRole("button", { name: "Lock Choice" }).click();

  await expect(page.getByRole("heading", { name: "Race 1" })).toBeVisible();
  await expect(page.locator(".reveal-racer-list img")).toHaveCount(4);
  await fillMastermindPredictions(page);
  await page.getByRole("button", { name: "Start Race" }).click();
  await expect(page.locator(".track-piece")).toHaveCount(4);
});
