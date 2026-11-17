import type { Metadata } from "next";
import "./globals.css";

const name = process.env.NEXT_PUBLIC_APP_NAME || "AutoPoster";

export const metadata: Metadata = {
  title: { default: `${name} · Schedule posts to every network`, template: `%s · ${name}` },
  icons: { icon: "/favicon.svg" },
  description: "Schedule and automatically publish posts to Facebook, Instagram, YouTube and Pinterest, each on its own timetable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
