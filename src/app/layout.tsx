import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Space_Grotesk } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

// Geist Sans + Geist Mono — Vercel-published font package (D-122).
// Latin Extended-A coverage includes Turkish glyphs (İ ı Ş ş Ğ ğ ç ö ü).
// GeistSans.variable → `--font-geist-sans`; GeistMono.variable → `--font-geist-mono`.
// globals.css maps `--font-sans` (body) / `--font-heading` / `--font-mono` to these vars.

// Space Grotesk — display/heading typeface for the Field-Industrial premium theme.
// `.variable` sets `--font-space-grotesk` on <html>; globals.css wires it to
// `--font-heading` so all h1–h4 + BrandHeading use Space Grotesk.
const SpaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "bayrak.ai",
  description: "Field operations platform for linear infrastructure contractors",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} ${SpaceGrotesk.variable}`}
    >
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
