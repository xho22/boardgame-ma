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
  await expect(dad.getByText("teamReveal", { exact: true })).toBeVisible();
  await expect(kid.getByText("teamReveal", { exact: true })).toBeVisible();

  await dad.getByRole("button", { name: "Begin Shared Selection" }).click();
  await expect(dad.getByText("selecting", { exact: true })).toBeVisible();
  await expect(kid.getByText("selecting", { exact: true })).toBeVisible();

  await dadContext.close();
  await kidContext.close();
});
