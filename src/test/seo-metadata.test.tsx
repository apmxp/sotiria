import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutDeveloperSection } from "@/components/sotiria/marketing";
import {
  ANDROID_APK_URL,
  DEVELOPER_NAME,
  pageHead,
  SITE_ORIGIN,
  SOTIRIA_STRUCTURED_DATA,
} from "@/lib/metadata";

afterEach(cleanup);

describe("public SEO metadata", () => {
  it("uses canonical, Open Graph, and social metadata for public pages", () => {
    const head = pageHead("Sotiría Features", "Features for child digital wellbeing.", {
      path: "/features",
      indexable: true,
    });

    expect(head.links).toContainEqual({
      rel: "canonical",
      href: `${SITE_ORIGIN}/features`,
    });
    expect(head.meta).toContainEqual({
      property: "og:url",
      content: `${SITE_ORIGIN}/features`,
    });
    expect(head.meta).toContainEqual({
      name: "twitter:card",
      content: "summary_large_image",
    });
    expect(head.meta).toContainEqual({
      name: "robots",
      content: "index,follow",
    });
  });

  it("marks account and private pages noindex by default", () => {
    const head = pageHead("Parent Overview", "Private family data.");

    expect(head.meta).toContainEqual({
      name: "robots",
      content: "noindex,nofollow",
    });
    expect(head.links).toEqual([]);
    expect(head.meta.some((entry) => "property" in entry && entry.property === "og:url")).toBe(false);
  });

  it("provides connected Person, Organization, and SoftwareApplication JSON-LD", () => {
    const head = pageHead("Sotiría", "Child digital wellbeing.", {
      path: "/",
      indexable: true,
      author: DEVELOPER_NAME,
      structuredData: SOTIRIA_STRUCTURED_DATA,
    });
    const script = head.meta.find((entry) => "script:ld+json" in entry);
    expect(script).toBeDefined();

    const jsonLd = JSON.parse(
      JSON.stringify((script as { "script:ld+json": unknown })["script:ld+json"]),
    );
    expect(jsonLd["@context"]).toBe("https://schema.org");
    const graph = jsonLd["@graph"] as Array<Record<string, unknown>>;
    const person = graph.find((entry) => entry["@type"] === "Person");
    const organization = graph.find((entry) => entry["@type"] === "Organization");
    const application = graph.find((entry) => entry["@type"] === "SoftwareApplication");

    expect(person).toMatchObject({
      name: DEVELOPER_NAME,
      jobTitle: "Developer and creator of Sotiría",
      url: `${SITE_ORIGIN}/#about-the-developer`,
    });
    expect(organization).toMatchObject({ name: "Sotiría", url: SITE_ORIGIN });
    expect(application).toMatchObject({
      name: "Sotiría",
      operatingSystem: "Android",
      softwareVersion: "0.1.0",
      identifier: "com.sotiria.companion",
      downloadUrl: ANDROID_APK_URL,
    });
    expect(application?.["creator"]).toMatchObject({ "@id": person?.["@id"] });
    expect(application?.["publisher"]).toMatchObject({ "@id": organization?.["@id"] });
  });

  it("includes only public pages in a well-formed sitemap and exposes it in robots.txt", () => {
    const sitemap = readFileSync(resolve(process.cwd(), "public/sitemap.xml"), "utf8");
    const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");
    const document = new DOMParser().parseFromString(sitemap, "application/xml");
    const locations = Array.from(document.getElementsByTagName("loc"), (node) => node.textContent);

    expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(locations).toEqual(
      ["/", "/features", "/for-parents", "/how-it-works", "/contact", "/privacy", "/terms"]
        .map((path) => new URL(path, SITE_ORIGIN).toString()),
    );
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(robots).not.toContain("Disallow: /parent/");
    expect(robots).not.toContain("Disallow: /child/");
  });

  it("identifies Selam as Sotiría's developer in visible homepage content", () => {
    render(<AboutDeveloperSection />);

    expect(
      screen.getByRole("heading", { name: `Created by ${DEVELOPER_NAME}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(/developer and creator of Sotiría/i)).toBeInTheDocument();
  });
});
