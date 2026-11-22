import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FirstRunSetup } from "@/components/first-run-setup";
import { brand } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description:
    "Edit videos in one simple workspace. Import footage, make clips, add captions and export with FREMIQ.",
  applicationName: brand.name,
  authors: [{ name: brand.name }],
  keywords: [
    "video editing",
    "AI editor",
    "local-first",
    "FFmpeg",
    "Whisper",
    "motion graphics",
    "FREMIQ",
  ],
  openGraph: {
    title: `${brand.name} — ${brand.tagline}`,
    description:
      "Plan, edit, caption and render video on your own machine with FREMIQ.",
    siteName: brand.name,
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#101116",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider>
          <Toaster theme="dark" position="top-right" closeButton />
          <FirstRunSetup />
          {children}
        </TooltipProvider>
        {/* WARNING FOR AGENT: DO NOT REMOVE THIS SCRIPT */}
        <Script src="https://cdn.jsdelivr.net/gh/IdeavoAI/ideavo-scripts@latest/scripts/ideavo.min.js" />
      </body>
    </html>
  );
}
