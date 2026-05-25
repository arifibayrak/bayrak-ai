import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

// Inter — single UI family. `latin-ext` is REQUIRED: the Turkish glyphs
// İ ı Ş ş Ğ ğ live in Latin Extended-A, not the base `latin` subset.
// Exposed as `--font-inter`; globals.css maps `--font-sans` → var(--font-inter).
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
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
    <html lang={locale}>
      <body className={`${inter.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
