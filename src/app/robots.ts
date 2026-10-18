import type { MetadataRoute } from "next";

/**
 * Next.js Robots.txt handler (RPD §8 & TASK-050)
 * Memastikan crawler search engine tidak mengindeks route privat aplikasi.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: [
        "/dashboard",
        "/inventory/",
        "/purchase-orders",
        "/documents",
        "/partners/",
        "/settings",
        "/audit-log",
      ],
    },
  };
}
