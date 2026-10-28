import type { Metadata } from "next";
import { Geist_Mono, Titillium_Web } from "next/font/google";

import { Providers } from "@/app/providers";
import "./globals.css";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700", "900"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ProxiCrédit", template: "%s · ProxiCrédit" },
  description: "Core banking microfinance",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${titillium.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
