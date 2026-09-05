import type { Metadata, Viewport } from "next";
import { PwaRuntime } from "@/components/pwa-runtime";
import { ThemeProvider } from "@/lib/theme-provider";
import { AppQueryProvider } from "./query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSE-PMS",
  description: "DSE Program Management System",
  applicationName: "DSE PMS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/pwa-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/rupp-logo.png", sizes: "512x512", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "DSE PMS",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
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
        <PwaRuntime />
      </body>
    </html>
  );
}
