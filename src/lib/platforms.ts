/** Display metadata that is safe to import from client components. */
export const PLATFORM_META: Record<string, { label: string; short: string; color: string; limit: number }> = {
  FACEBOOK: { label: "Facebook Page", short: "FB", color: "bg-blue-600", limit: 5000 },
  INSTAGRAM: { label: "Instagram", short: "IG", color: "bg-pink-600", limit: 2200 },
  YOUTUBE: { label: "YouTube", short: "YT", color: "bg-red-600", limit: 5000 },
  PINTEREST: { label: "Pinterest", short: "PI", color: "bg-rose-700", limit: 800 },
  BLUESKY: { label: "Bluesky", short: "BS", color: "bg-sky-500", limit: 300 },
  TELEGRAM: { label: "Telegram", short: "TG", color: "bg-cyan-600", limit: 4096 },
  MASTODON: { label: "Mastodon", short: "MA", color: "bg-violet-600", limit: 500 },
  MOCK: { label: "Test network", short: "TS", color: "bg-slate-600", limit: 5000 },
};

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
