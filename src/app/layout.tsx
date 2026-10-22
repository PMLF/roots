import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/ui/i18n/LocaleProvider";
import { Shell } from "@/ui/components/Shell";
import { ProviderEngine } from "@/ui/EngineProvider";
import "./globals.css";

export const metadata: Metadata = { title: "Raízes", description: "Gestão de futebol português ligada às cidades", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>
        <LocaleProvider>
          <ProviderEngine>
            <Shell>{children}</Shell>
          </ProviderEngine>
        </LocaleProvider>
      </body>
    </html>
  );
}
