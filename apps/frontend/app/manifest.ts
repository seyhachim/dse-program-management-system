import type { MetadataRoute } from "next";

/**
 * Install metadata for the existing DSE PMS web application.
 *
 * The PWA is only another presentation/launch mode for the same application;
 * it does not create a separate academic data source or authorization path.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DSE Program Management System",
    short_name: "DSE PMS",
    description: "Data Science and Engineering Program Management System at RUPP",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f1e3a",
    lang: "en",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/rupp-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa-maskable-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
