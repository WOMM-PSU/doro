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
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
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
