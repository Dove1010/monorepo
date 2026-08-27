import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Private conversations between tenants and landlords — never indexable.
 */
export const metadata: Metadata = privatePageMetadata("Messages");

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
