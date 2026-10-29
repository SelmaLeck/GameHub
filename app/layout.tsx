import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "V//Games",
  description: "Stream-Games für den Twitchchat",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
