import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/seo";

/**
 * Token-addressed rating card.
 *
 * The link is shareable by design, which is exactly why it must never reach a
 * search index: the token is the only access control, and an indexed — or
 * merely cached or snippeted — copy would outlive its revocation and expose a
 * named tenant's payment history. Hence noarchive/nosnippet alongside noindex.
 */
export const metadata: Metadata = {
  robots: NO_INDEX,
  title: "Tenant Rating Card — Shelterflex",
  description:
    "View this tenant's verified reputation score, payment history, and landlord ratings on Shelterflex.",
  openGraph: {
    title: "Tenant Rating Card — Shelterflex",
    description:
      "Verified tenant reputation: payment history, property care, and communication scores from past landlords.",
    siteName: "Shelterflex",
    type: "profile",
  },
  twitter: {
    card: "summary",
    title: "Tenant Rating Card — Shelterflex",
    description:
      "Verified tenant reputation score on Shelterflex.",
  },
};

export default function RatingCardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
