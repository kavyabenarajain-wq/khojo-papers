import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { MobileTabBar } from "@/components/layout/NavLinks";
import { StatusBanners } from "@/components/layout/StatusBanners";
import { getViewer } from "@/lib/auth/session";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], display: "swap" });

// Every page depends on the signed-in user or live content, so nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "KHOJO PAPERS — ICSE Class 10 practice", template: "%s · KHOJO PAPERS" },
  description: "Every ICSE answer, checked. Every explanation, drawn. Practise ICSE Class 10 questions with worked solutions and rubric-based feedback.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#151513" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  const prefs = viewer?.preferences ?? {};
  return (
    <html
      lang="en-IN"
      className={`${inter.variable} ${serif.variable} h-full antialiased`}
      data-text-size={prefs.textSize ?? "default"}
      data-reduced-motion={prefs.reducedMotion ? "true" : undefined}
      data-contrast={prefs.highContrast ? "high" : undefined}
    >
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">
          Skip to content
        </a>
        <SiteHeader />
        <StatusBanners />
        <main id="main" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <SiteFooter />
        <MobileTabBar />
      </body>
    </html>
  );
}
