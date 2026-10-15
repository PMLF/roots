import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/ui/i18n/LocaleProvider";
import { Shell } from "@/ui/components/Shell";
import "./globals.css";

export const metadata: Metadata = { title: "Raízes", description: "Gestão de futebol português ligada às cidades" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>
        <LocaleProvider>
          <Shell>{children}</Shell>
        </LocaleProvider>
      </body>
    </html>
  );
}
