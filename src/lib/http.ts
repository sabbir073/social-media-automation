import { NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getUser } from "./auth";
import { sha256 } from "./crypto";
import { prisma } from "./db";
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
type Opts = { auth?: "user" | "admin" | "none"; apiKey?: boolean };

/** Resolves `Authorization: Bearer <api key>` to its owner (public API routes only). */
async function userFromApiKey(req: NextRequest): Promise<User | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(token) }, include: { user: true } });
  if (!key) throw new HttpError(401, "Invalid API key");
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }
  return key.user;
}

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
      const mode = opts.auth ?? "user";
      const viaKey = opts.apiKey ? await userFromApiKey(req) : null;
      if (!viaKey) checkOrigin(req); // key-authenticated calls carry no cookie, so CSRF does not apply
      const user = mode === "none" ? null : (viaKey ?? (await getUser()));
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
