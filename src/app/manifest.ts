import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MPIRE Property Management",
    short_name: "MPIRE",
    description:
      "Professional property management system for MPIRE Property Management, Oman",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0A0F",
    theme_color: "#C9A84C",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
