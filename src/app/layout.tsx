import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Doro — Get your stuff done.",
    template: "%s · Doro",
  },
  description:
    "Doro is a local peer-to-peer task marketplace for small real-world tasks: deliveries, errands, study help, tech help and light moving.",
  applicationName: "Doro",
  keywords: ["local tasks", "campus errands", "task marketplace", "Doro"],
  // Installable app: the manifest comes from app/manifest.ts.
  appleWebApp: { capable: true, title: "Doro", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // The tab icon is the circular mark. The square PNGs are install/apple
  // artwork only — pointing `icon` at them put a lime square in the tab.
  // It lives in public/icons so it is revalidated (`max-age=0`); the app/icon
  // convention ships the same file as `immutable, max-age=1y`, which would
  // hide any future change to the logo.
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F8F5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
