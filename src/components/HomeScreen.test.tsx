import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatBuildTimestamp, HomeScreen } from "./HomeScreen";

describe("HomeScreen", () => {
  it("shows the build update time in China Standard Time", () => {
    const markup = renderToStaticMarkup(
      <HomeScreen
        hasSavedGame={false}
        onNewGame={() => undefined}
        onContinueGame={() => undefined}
        onOpenCatalog={() => undefined}
        onOpenOnlineRoom={() => undefined}
      />,
    );

    expect(markup).toContain("最后更新：");
    expect(markup).toContain("UTC+8");
    expect(formatBuildTimestamp("2026-08-20T12:34:56.000Z")).toBe("2026/08/20 20:34");
  });
});
