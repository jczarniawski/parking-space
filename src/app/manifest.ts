import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MT Parking",
    short_name: "MT Parking",
    description: "Book office parking spots at Match-Trade.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1b5ff5",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
