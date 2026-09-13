import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const displayFont = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Business Student Opportunity Dashboard",
  description: "Discovers and ranks internships, fellowships, and programs for business students.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body className="min-h-screen bg-cream text-ink">
        <header className="border-b border-brand-200/60 bg-cream-100">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-serif text-xl font-semibold text-ink">
              Opportunity <span className="text-brand-600">Dashboard</span>
            </Link>
            <nav className="flex gap-4 text-sm font-medium text-ink-light">
              <Link href="/" className="transition hover:text-brand-600">
                Dashboard
              </Link>
              <Link href="/saved" className="transition hover:text-brand-600">
                Saved
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
