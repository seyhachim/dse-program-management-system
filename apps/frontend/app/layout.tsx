import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme-provider";
import { AppQueryProvider } from "./query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSE-PMS",
  description: "DSE Program Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="font-sans"
    >
      <body>
        <AppQueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AppQueryProvider>
      </body>
    </html>
  );
}
