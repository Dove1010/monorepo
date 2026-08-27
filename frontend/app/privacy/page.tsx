import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const dynamic = "force-static";

/**
 * Non-canonical duplicate of `/privacy-policy`.
 *
 * Every section below is placeholder text, while `/privacy-policy` carries the
 * substantive policy and is the route the app links to. Until a maintainer
 * confirms which route is canonical (see #1446), this one is excluded from
 * indexing and points its canonical URL at `/privacy-policy` so search engines
 * cannot deliver a user to the placeholder version.
 */
export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Shelterflex collects, uses, and protects your personal data. Official legal copy will be updated before launch.",
  alternates: { canonical: "/privacy-policy" },
  robots: { index: false, follow: false },
};

const PLACEHOLDER =
  "This section will be updated before launch. Official legal copy is being prepared by our legal team.";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="May 30, 2026"
      sections={[
        {
          title: "1. Introduction",
          content: <p>{PLACEHOLDER}</p>,
        },
        {
          title: "2. Information We Collect",
          content: <p>{PLACEHOLDER}</p>,
        },
        {
          title: "3. How We Use Your Information",
          content: <p>{PLACEHOLDER}</p>,
        },
        {
          title: "4. Data Sharing and Disclosure",
          content: <p>{PLACEHOLDER}</p>,
        },
        {
          title: "5. Your Rights",
          content: <p>{PLACEHOLDER}</p>,
        },
        {
          title: "6. Contact",
          content: (
            <p>
              Privacy questions? Email{" "}
              <a
                href="mailto:privacy@shelterflex.com"
                className="underline hover:text-foreground"
              >
                privacy@shelterflex.com
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
