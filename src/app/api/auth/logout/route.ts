import { destroySession } from "@/lib/auth";
import { handler } from "@/lib/http";

export const POST = handler(
  async () => {
    await destroySession();
    return { ok: true };
  },
  { auth: "none" },
);
