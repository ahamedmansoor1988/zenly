import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateNightReview } from "@/lib/zenly/night-review";

export const dynamic = "force-dynamic";

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

function asCount(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(100000, Math.round(number));
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const localTime = typeof body.localTime === "string" && TIME_PATTERN.test(body.localTime) ? body.localTime : "20:00";

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: snapshots, error: snapshotsError } = await supabase
    .from("zenly_workload_snapshots")
    .select("captured_at, overload_score, state")
    .eq("user_id", authData.user.id)
    .gte("captured_at", startOfDay.toISOString())
    .order("captured_at", { ascending: true })
    .limit(500);

  if (snapshotsError) {
    return NextResponse.json({ error: snapshotsError.message }, { status: 500 });
  }

  try {
    const review = await generateNightReview({
      localTime,
      snapshots: (snapshots ?? []).map((row) => ({
        captured_at: row.captured_at,
        overload_score: Number(row.overload_score),
        state: row.state,
      })),
      focus: {
        sessions: asCount(body.focus?.sessions),
        minutes: asCount(body.focus?.minutes),
        breaks: asCount(body.focus?.breaks),
      },
    });
    return NextResponse.json({ review });
  } catch {
    return NextResponse.json({ error: "Night review generation failed" }, { status: 502 });
  }
}
