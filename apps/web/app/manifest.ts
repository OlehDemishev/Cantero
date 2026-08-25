import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cantero",
    short_name: "Cantero",
    description: "Estimate → materials → invoice, in one place.",
    start_url: "/field",
    scope: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#465fff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/manifest-icons/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/manifest-icons/icon-192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/manifest-icons/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/manifest-icons/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
