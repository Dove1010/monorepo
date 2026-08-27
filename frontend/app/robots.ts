import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Crawler-level backstop for the private and token-addressed routes.
 *
 * The per-route `robots` metadata is the primary control — it is what a crawler
 * honours once it has the page. This file stops well-behaved crawlers reaching
 * those URLs in the first place, which matters most for the token routes, where
 * the URL itself is the secret.
 *
 * Deliberately narrow: this is an exclusion list, not a sitemap or robots
 * overhaul.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard/",
          "/wallet",
          "/messages",
          "/onboarding",
          "/pre-screen",
          "/report",
          "/staking",
          "/tenant/",
          "/verify-otp",
          "/forgot-password",
          "/offline",
          "/whistleblower/dashboard",
          "/whistleblower/earnings",
          // Token-addressed rating cards: the link is the access control, so
          // these must never be fetched, cached, or indexed.
          "/rating-card/",
          "/public/tenant-rating/",
        ],
      },
    ],
    host: SITE_URL,
  };
}
