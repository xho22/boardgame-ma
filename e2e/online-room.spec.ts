import { expect, test } from "@playwright/test";

test("synchronizes a fixed room between two browser contexts", async ({ browser }) => {
  const dadContext = await browser.newContext();
  const kidContext = await browser.newContext();
  const dad = await dadContext.newPage();
  const kid = await kidContext.newPage();

  await Promise.all([dad.goto("/"), kid.goto("/")]);
  await Promise.all([
    dad.getByRole("button", { name: "Online Room" }).click(),
    kid.getByRole("button", { name: "Online Room" }).click(),
  ]);

  await dad.locator(".room-join-form input").fill("Dad");
  await kid.locator(".room-join-form input").fill("Kid");
  await Promise.all([
    dad.getByRole("button", { name: "Join Room" }).click(),
    kid.getByRole("button", { name: "Join Room" }).click(),
  ]);

  await expect(dad.getByText("座位 2 / 6")).toBeVisible();
  await expect(kid.getByText("Dad")).toBeVisible();
  await expect(dad.getByText("Kid")).toBeVisible();

  await dad.getByRole("button", { name: "Start Shared Test Game" }).click();
  await expect(dad.getByRole("heading", { name: "Teams" })).toBeVisible();
  await expect(kid.getByRole("heading", { name: "Teams" })).toBeVisible();

  await dad.getByRole("button", { name: "Choose Racers" }).click();
  await expect(dad.getByRole("button", { name: "Lock Choice" })).toBeVisible();
  await expect(kid.getByText("等待 Dad 选择 racer")).toBeVisible();

  await dad.locator(".selectable-racer").first().click();
  await dad.getByRole("button", { name: "Lock Choice" }).click();
  await expect(kid.getByRole("button", { name: "Lock Choice" })).toBeVisible();
  await expect(dad.getByText("等待 Kid 选择 racer")).toBeVisible();

  await kid.locator(".selectable-racer").first().click();
  await kid.getByRole("button", { name: "Lock Choice" }).click();
  await expect(dad.getByRole("heading", { name: "Race 1" })).toBeVisible();
  await expect(kid.getByRole("heading", { name: "Race 1" })).toBeVisible();

  for (const page of [dad, kid]) {
    while (await page.locator("select:not([disabled])").count()) {
      await page.locator("select:not([disabled])").first().selectOption({ index: 1 });
    }
  }

  await dad.getByRole("button", { name: "Start Race" }).click();
  await expect(dad.getByRole("heading", { name: "Track" })).toBeVisible();
  await expect(kid.getByRole("heading", { name: "Track" })).toBeVisible();

  await dadContext.close();
  await kidContext.close();
});
