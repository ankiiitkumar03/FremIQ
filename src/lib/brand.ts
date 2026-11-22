export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "FREMIQ",
  tagline:
    process.env.NEXT_PUBLIC_BRAND_TAGLINE ??
    "The intelligence behind every frame.",
  productCategory: "Local-first AI creative operating system",
  version: "1.0.0",
  accent: process.env.NEXT_PUBLIC_BRAND_ACCENT ?? "#A78BFA",
  supportEmail: process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL ?? "support@fremiq.local",
  website: process.env.NEXT_PUBLIC_BRAND_WEBSITE ?? "https://fremiq.local",
} as const;

export type Brand = typeof brand;
