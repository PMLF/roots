import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/ui/i18n/LocaleProvider";
import { Shell } from "@/ui/components/Shell";
import { GoalNet } from "@/ui/components/GoalNet";
import { ProviderEngine } from "@/ui/EngineProvider";
import "./globals.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Raízes",
  description: "Gestão de futebol português ligada às cidades",
  robots: { index: false, follow: false },
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icons/icon-192.png`, apple: `${base}/icons/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Raízes", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0e1411" }, { media: "(prefers-color-scheme: light)", color: "#f3f5f4" }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>
        <GoalNet />
        <LocaleProvider>
          <ProviderEngine>
            <Shell>{children}</Shell>
          </ProviderEngine>
        </LocaleProvider>
      </body>
    </html>
  );
}
