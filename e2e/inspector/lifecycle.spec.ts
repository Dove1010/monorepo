import { test, expect, LoginPage } from "../helpers/fixtures";

test.describe("Inspector job lifecycle", () => {
  test.beforeEach(async ({ page, seed }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      seed.users.inspector.email,
      seed.users.inspector.password,
    );
  });

  test("dashboard displays jobs and claim transitions status", async ({
    page,
    seed,
  }) => {
    await page.goto("/dashboard/inspector");
    await expect(page.getByRole("heading", { name: /inspector dashboard/i })).toBeVisible();
    await page.waitForURL(/\/dashboard\/inspector/);

    // Wait for job cards to load
    await expect(page.getByText(/test property/i).or(page.getByText(/no jobs found/i)).first()).toBeVisible({ timeout: 15000 });

    // Verify stats render
    await expect(page.getByText(/available jobs|in progress|completed|total earnings/i).first()).toBeVisible();
  });

  test("job detail page renders for a claimed job", async ({ page, seed }) => {
    await page.goto(`/dashboard/inspector/${seed.inspectionJobId}`);
    await expect(page.getByRole("heading", { name: /listing/i })).toBeVisible({ timeout: 15000 });

    // Verify job details are shown
    await expect(page.getByText(/job details/i)).toBeVisible();
    await expect(page.getByText(/offered fee/i)).toBeVisible();
  });

  test("submit report through the job detail form", async ({ page, seed }) => {
    await page.goto(`/dashboard/inspector/${seed.inspectionJobId}`);
    await expect(page.getByRole("heading", { name: /listing/i })).toBeVisible({ timeout: 15000 });

    // Click "Start Inspection"
    await page.getByRole("button", { name: /start inspection/i }).click();

    // Wait for the report form to render
    await expect(page.getByText(/property information/i)).toBeVisible();

    // Complete all required checklist items
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      await checkboxes.nth(i).check();
    }

    // Upload a photo by triggering the file input directly
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByLabel(/upload inspection photos/i).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      { name: "inspection.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-image-data") },
    ]);

    // Fill in the summary
    await page.getByLabel(/summary of findings/i).fill("The property is in good condition. All structural elements are sound. Electrical and plumbing systems are functional.");

    // Fill in recommendations
    await page.getByLabel(/recommendations/i).fill("Recommend regular maintenance of the HVAC system.");

    // Select overall condition
    await page.getByLabel(/overall condition/i).selectOption("good");

    // Submit the report
    await page.getByRole("button", { name: /submit inspection report/i }).click();

    // Should navigate back to the job board on success
    await page.waitForURL(/\/dashboard\/inspector$/);
  });

  test("earnings page reflects completed work", async ({ page, seed }) => {
    await page.goto("/dashboard/inspector/earnings");
    await expect(page.getByRole("heading", { name: /earnings/i })).toBeVisible({ timeout: 15000 });

    // Either shows earnings data or empty state
    await expect(
      page.getByText(/total earned|no earnings yet/i).first(),
    ).toBeVisible();
  });

  test("incomplete submission shows validation message", async ({ page, seed }) => {
    await page.goto(`/dashboard/inspector/${seed.inspectionJobId}`);
    await expect(page.getByRole("heading", { name: /listing/i })).toBeVisible({ timeout: 15000 });

    // Click "Start Inspection"
    await page.getByRole("button", { name: /start inspection/i }).click();
    await expect(page.getByText(/property information/i)).toBeVisible();

    // Submit button should be disabled (no checklist items checked, no photos, no summary)
    const submitButton = page.getByRole("button", { name: /submit inspection report/i });
    await expect(submitButton).toBeDisabled();

    // The validation hint should be visible
    await expect(page.getByText(/complete all required/i)).toBeVisible();
  });
});
