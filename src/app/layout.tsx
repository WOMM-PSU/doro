import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Doro — A little help, for a fair price",
    template: "%s · Doro",
  },
  description:
    "Doro is a local peer-to-peer task marketplace for small real-world tasks: deliveries, errands, study help, tech help and light moving.",
  applicationName: "Doro",
  keywords: ["local tasks", "campus errands", "task marketplace", "Doro"],
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
