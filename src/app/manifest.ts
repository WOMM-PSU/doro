import type { MetadataRoute } from "next";

/**
 * Installable web app metadata. Next serves this at /manifest.webmanifest and
 * links it from every page, which is what makes the browser offer "Install".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Doro — Get your stuff done.",
    short_name: "Doro",
    description:
      "Ask someone nearby for a paid favour: deliveries, errands, study help, tech help and light moving.",
    start_url: "/discover",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F8F5",
    theme_color: "#F7F8F5",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Post a task", short_name: "Post", url: "/discover" },
      { name: "My activity", short_name: "Activity", url: "/activity" },
    ],
  };
}
