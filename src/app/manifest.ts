import type { MetadataRoute } from "next";

/** Makes the app installable on phones and desktops ("Add to Home screen"). */
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "AutoPoster";
  return {
    name,
    short_name: name,
    description: "Schedule and automatically publish posts to all your social networks.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2553e0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
