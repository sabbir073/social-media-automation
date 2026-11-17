/** Display metadata that is safe to import from client components. */
export const PLATFORM_META: Record<string, { label: string; short: string; color: string }> = {
  FACEBOOK: { label: "Facebook Page", short: "FB", color: "bg-blue-600" },
  INSTAGRAM: { label: "Instagram", short: "IG", color: "bg-pink-600" },
  YOUTUBE: { label: "YouTube", short: "YT", color: "bg-red-600" },
  PINTEREST: { label: "Pinterest", short: "PI", color: "bg-rose-700" },
  MOCK: { label: "Test network", short: "TS", color: "bg-slate-600" },
};

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
