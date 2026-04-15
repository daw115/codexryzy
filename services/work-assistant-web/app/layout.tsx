import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Work Assistant",
    template: "%s · Work Assistant",
  },
  description: "Prywatny dashboard operacyjny dla serwerowego asystenta pracy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className="dark">
      <body>{children}</body>
    </html>
  );
}
