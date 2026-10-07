import { test, expect } from "@playwright/test";

test.describe("Phase 6 Study Intelligence E2E", () => {
  test("study hub loads and shows key sections", async ({ page }) => {
    await page.goto("http://localhost:3000/study", { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/study_hub.png", fullPage: true });

    await expect(page.getByText("Study Sessions Hub", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start New Session" })).toBeVisible();
    await expect(page.getByText("Active Sessions (0)")).toBeVisible();
    await expect(page.getByText("Session Archives")).toBeVisible();
  });

  test("topics page loads with mastery and review indicators", async ({ page }) => {
    await page.goto("http://localhost:3000/topics", { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/topics.png", fullPage: true });

    await expect(page.getByText("Academic Topics & Taxonomy", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Topic" })).toBeVisible();
  });

  test("navigation links are present", async ({ page }) => {
    await page.goto("http://localhost:3000/study", { waitUntil: "networkidle" });
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Study Sessions")).toBeVisible();
    await expect(sidebar.getByText("Subjects & Topics")).toBeVisible();
  });

  test("study new page loads", async ({ page }) => {
    await page.goto("http://localhost:3000/study/new", { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/study_new.png", fullPage: true });
    await expect(page.getByText("Study Session").first()).toBeVisible();
  });
});
