import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Applicant pre-screening carries personal financial input — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Pre-Screening");

export default function PreScreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
