import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: {
    default: "Work Assistant",
    template: "%s · Work Assistant",
  },
  description: "Prywatny dashboard operacyjny dla serwerowego asystenta pracy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
