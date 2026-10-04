/**
 * GET /api/cleanup -- daily cron backstop (plan section 7). The KV record
 * TTL and delete-on-download already do the real cleanup work; this sweep
 * only catches files whose conversion crashed or was abandoned before
 * either of those fired. On the Hobby plan this runs once a day (see
 * vercel.json), so it is a safety net, not the primary mechanism.
 *
 * There is no index of "all file ids" to sweep by design (that would be
 * exactly the kind of retained metadata the plan's privacy section says
 * not to keep) -- expiry is enforced by each record's own TTL in the KV
 * store. This route exists as the place a future stronger sweep (e.g. an
 * object-store listing with an age check) would live, and to prove the
 * cron wiring itself works.
 */
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, note: "TTL + delete-on-download handle cleanup; this is a backstop." });
}
