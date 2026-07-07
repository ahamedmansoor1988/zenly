import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATES = new Set(["calm", "focused", "busy", "overloaded", "after_hours"]);

function asScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, number));
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function GET() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("zenly_workload_snapshots")
    .select("*")
    .eq("user_id", authData.user.id)
    .order("captured_at", { ascending: false })
    .limit(24);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snapshots: data ?? [] });
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

  const communicationLoad = asScore(body.communicationLoad);
  const activityLoad = asScore(body.activityLoad);
  const durationLoad = asScore(body.durationLoad);
  const recoveryCredit = asScore(body.recoveryCredit);
  const overloadScore = asScore(body.overloadScore);
  const state = typeof body.state === "string" && STATES.has(body.state) ? body.state : null;

  if (
    communicationLoad === null ||
    activityLoad === null ||
    durationLoad === null ||
    recoveryCredit === null ||
    overloadScore === null ||
    !state
  ) {
    return NextResponse.json({ error: "Missing or invalid workload fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("zenly_workload_snapshots")
    .insert({
      user_id: authData.user.id,
      source: body.source === "tauri" || body.source === "import" ? body.source : "web",
      captured_at: typeof body.capturedAt === "string" ? body.capturedAt : new Date().toISOString(),
      communication_load: communicationLoad,
      activity_load: activityLoad,
      duration_load: durationLoad,
      recovery_credit: recoveryCredit,
      overload_score: overloadScore,
      state,
      gmail_signals: asObject(body.gmailSignals),
      slack_signals: asObject(body.slackSignals),
      input_activity: asObject(body.inputActivity),
      recommendation: asObject(body.recommendation),
    })
    .select("id, captured_at, overload_score, state")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snapshot: data });
}
