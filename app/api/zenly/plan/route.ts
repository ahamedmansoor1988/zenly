import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlan, PlanContext } from "@/lib/zenly/plan";

export const dynamic = "force-dynamic";

const STATES = new Set(["calm", "focused", "busy", "overloaded", "after_hours"]);
const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

function asScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

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

  const state = typeof body.state === "string" && STATES.has(body.state) ? body.state : "calm";
  const localTime = typeof body.localTime === "string" && TIME_PATTERN.test(body.localTime) ? body.localTime : "09:00";

  // Trend context is optional — the snapshots table may not exist yet.
  let recentStates: string[] = [];
  const { data: snapshots } = await supabase
    .from("zenly_workload_snapshots")
    .select("state")
    .eq("user_id", authData.user.id)
    .order("captured_at", { ascending: false })
    .limit(8);
  if (Array.isArray(snapshots)) {
    recentStates = snapshots.map((row) => row.state).filter((value): value is string => typeof value === "string");
  }

  const context: PlanContext = {
    localTime,
    state,
    overloadScore: asScore(body.overloadScore),
    communicationLoad: asScore(body.communicationLoad),
    activityLoad: asScore(body.activityLoad),
    durationLoad: asScore(body.durationLoad),
    gmailSignals: body.gmailSignals
      ? {
          unread: asCount(body.gmailSignals.unread),
          important: asCount(body.gmailSignals.important),
          urgent: asCount(body.gmailSignals.urgent),
        }
      : null,
    slackSignals: body.slackSignals
      ? {
          messages: asCount(body.slackSignals.messages),
          mentions: asCount(body.slackSignals.mentions),
          priorityChannels: asCount(body.slackSignals.priorityChannels),
        }
      : null,
    focus: {
      sessions: asCount(body.focus?.sessions),
      minutes: asCount(body.focus?.minutes),
      breaks: asCount(body.focus?.breaks),
    },
    recentStates,
  };

  try {
    const plan = await generatePlan(context);
    if (!plan) {
      return NextResponse.json({ error: "Plan generation unavailable" }, { status: 502 });
    }
    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: "Plan generation failed" }, { status: 502 });
  }
}
