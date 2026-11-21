import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AndroidDownloadSection } from "@/components/sotiria/marketing";

afterEach(cleanup);

describe("public Android download section", () => {
  it("links directly to the versioned APK and explains installation and Usage Access", () => {
    render(<AndroidDownloadSection />);

    expect(
      screen.getByRole("link", { name: /download apk/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/apmxp/sotiria/releases/download/v0.1.0/app-debug.apk",
    );
    expect(screen.getByText(/version v0\.1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/updates to the android app will be published on this website/i)).toBeInTheDocument();
    expect(screen.getByText(/usage access.*required for screen-time monitoring and syncing/i)).toBeInTheDocument();
  });
});
