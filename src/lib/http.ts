import { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getUser } from "./auth";
import { env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx<P> = { req: NextRequest; params: P; user: User };
type Opts = { auth?: "user" | "admin" | "none" };

/** Blocks cross-site form/fetch submissions (CSRF) for state-changing requests. */
function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client; cookie is SameSite=Lax anyway
  if (new URL(origin).host !== new URL(env.appUrl).host && origin !== req.nextUrl.origin) {
    throw new HttpError(403, "Cross-site request blocked");
  }
}

export function handler<P = Record<string, string>>(
  fn: (ctx: Ctx<P>) => Promise<unknown>,
  opts: Opts = {},
) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    try {
      checkOrigin(req);
      const mode = opts.auth ?? "user";
      const user = mode === "none" ? null : await getUser();
      if (mode !== "none" && !user) throw new HttpError(401, "Please sign in");
      if (mode === "admin" && user?.role !== "ADMIN") throw new HttpError(403, "Admins only");
      const result = await fn({ req, params: await route.params, user: user as User });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        const first = e.issues[0];
        const where = first.path.length ? `${first.path.join(".")}: ` : "";
        return NextResponse.json({ error: `${where}${first.message}` }, { status: 400 });
      }
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function body<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  return schema.parse(json);
}
