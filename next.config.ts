import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  // The owner-report PDF generator (src/lib/owners/monthly-report-pdf.tsx)
  // reads ThmanyahSans-*.otf at runtime via path.resolve(process.cwd(),
  // "public/fonts/..."). Vercel's serverless bundler doesn't trace static
  // assets unless we list them explicitly, so the function ships without
  // the font files and Font.register fails with "Could not resolve font".
  // List both the wildcard and bracketed forms — Next.js's matcher for
  // App Router dynamic segments has flipped between minor versions, so
  // covering both shapes guarantees the OTFs land in the function bundle.
  outputFileTracingIncludes: {
    "/api/owners/*/monthly-report/pdf": ["./public/fonts/**/*"],
    "/api/owners/[id]/monthly-report/pdf": ["./public/fonts/**/*"],
    "/api/cron/owner-reports": ["./public/fonts/**/*"],
  },
};

export default withNextIntl(nextConfig);
