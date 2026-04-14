import type { Metadata } from "next";
<<<<<<< HEAD
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

=======
import "./globals.css";

>>>>>>> origin/main
export const metadata: Metadata = {
  title: {
    default: "Work Assistant",
    template: "%s · Work Assistant",
  },
  description: "Prywatny dashboard operacyjny dla serwerowego asystenta pracy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
<<<<<<< HEAD
    <html lang="pl">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
=======
    <html lang="pl" className="dark">
      <body>{children}</body>
>>>>>>> origin/main
    </html>
  );
}
