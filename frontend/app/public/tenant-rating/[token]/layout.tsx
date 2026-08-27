import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Token-addressed tenant rating card. Anyone holding the link can open it, so beyond noindex this also sets noarchive/nosnippet — a cached copy or search snippet would leak a tenant's payment record after the token is revoked.
 */
export const metadata: Metadata = privatePageMetadata("Tenant Rating Card");

export default function SharedTenantRatingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
