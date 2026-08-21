import { expect, test } from "@playwright/test";

async function selectTestRoom(page: Parameters<typeof test>[0]["page"], roomId: string) {
  await page.locator(".room-join-form select").evaluate((select, value) => {
    select.add(new Option(value, value));
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, roomId);
}

test("synchronizes a fixed room between two browser contexts", async ({ browser }, testInfo) => {
  const roomId = `e2e-${testInfo.project.name}-${Date.now()}`;
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
  await selectTestRoom(dad, roomId);
  await selectTestRoom(kid, roomId);
  await dad.getByRole("button", { name: "Join Room" }).click();
  await expect(dad.getByText("座位 1 / 6")).toBeVisible();
  await kid.getByRole("button", { name: "Join Room" }).click();

  await expect(dad.getByText("座位 2 / 6")).toBeVisible();
  await expect(kid.getByText("Dad")).toBeVisible();
  await expect(dad.getByText("Kid")).toBeVisible();

  await dad.getByRole("button", { name: "Start Shared Game" }).click();
  await expect(dad.getByRole("heading", { name: "Teams" })).toBeVisible();
  await expect(kid.getByRole("heading", { name: "Teams" })).toBeVisible();

  await dad.getByRole("button", { name: "Choose Racers" }).click();
  await expect(dad.getByRole("button", { name: "Lock Choice" })).toBeVisible();
  await expect(kid.getByRole("button", { name: "Lock Choice" })).toBeVisible();
  await expect(dad.getByText("0 / 2 位玩家已锁定")).toBeVisible();

  await Promise.all([
    dad.locator(".selectable-racer").first().click(),
    kid.locator(".selectable-racer").first().click(),
  ]);
  await Promise.all([
    dad.getByRole("button", { name: "Lock Choice" }).click(),
    kid.getByRole("button", { name: "Lock Choice" }).click(),
  ]);
  await expect(dad.getByRole("heading", { name: "Race 1" })).toBeVisible();
  await expect(kid.getByRole("heading", { name: "Race 1" })).toBeVisible();

  for (const page of [dad, kid]) {
    while (await page.locator("select:not([disabled])").count()) {
      const select = page.locator("select:not([disabled])").first();
      await select.selectOption({ index: 1 });
      await expect(select).not.toHaveValue("");
    }
  }

  await dad.getByRole("button", { name: "Start Race" }).click();
  await expect(dad.getByRole("heading", { name: "魔法运动会" })).toBeVisible();
  await expect(kid.getByRole("heading", { name: "魔法运动会" })).toBeVisible();

  dad.once("dialog", (dialog) => dialog.accept());
  await dad.getByRole("button", { name: "重置本局" }).click();
  await expect(dad.getByRole("button", { name: "Start Shared Game" })).toBeVisible();
  await expect(kid.getByText("等待房主设置每人 racer 数量、Debug 模式和棋盘模式。")).toBeVisible();
  await expect(dad.getByText("座位 2 / 6")).toBeVisible();

  await kidContext.close();
  await expect(dad.getByRole("button", { name: "移除" })).toBeVisible();
  dad.once("dialog", (dialog) => dialog.accept());
  await dad.getByRole("button", { name: "移除" }).click();
  await expect(dad.getByText("座位 1 / 6")).toBeVisible();

  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await friend.goto("/");
  await friend.getByRole("button", { name: "Online Room" }).click();
  await friend.locator(".room-join-form input").fill("Friend");
  await selectTestRoom(friend, roomId);
  await friend.getByRole("button", { name: "Join Room" }).click();
  await expect(dad.getByText("座位 2 / 6")).toBeVisible();
  await expect(friend.getByText("Dad")).toBeVisible();

  await dadContext.close();
  await friendContext.close();
});

test("lets the host clear a room and release every other seat", async ({ browser }, testInfo) => {
  const roomId = `clear-${testInfo.project.name}-${Date.now()}`;
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await Promise.all([host.goto("/"), guest.goto("/")]);
  await Promise.all([
    host.getByRole("button", { name: "Online Room" }).click(),
    guest.getByRole("button", { name: "Online Room" }).click(),
  ]);
  await host.locator(".room-join-form input").fill("Host");
  await guest.locator(".room-join-form input").fill("Guest");
  await selectTestRoom(host, roomId);
  await selectTestRoom(guest, roomId);
  await host.getByRole("button", { name: "Join Room" }).click();
  await guest.getByRole("button", { name: "Join Room" }).click();
  await expect(host.getByText("座位 2 / 6")).toBeVisible();

  host.once("dialog", (dialog) => dialog.accept());
  await host.getByRole("button", { name: "清空房间" }).click();
  await expect(host.getByText("座位 1 / 6")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Join Room" })).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
