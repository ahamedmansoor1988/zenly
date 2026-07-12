import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

const WORKLOAD_STATES = new Set(["calm", "focused", "busy", "overloaded", "after_hours"]);
const ACTION_TYPES = new Set(["browser_notification", "append_record"]);

export async function GET(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const baseId = request.nextUrl.searchParams.get("baseId");
  if (!baseId) return NextResponse.json({ error: "baseId is required" }, { status: 400 });

  const { data: automations, error } = await supabase
    .from("zenly_automations")
    .select("id, name, enabled, trigger, action, last_fired_at, fire_count, created_at")
    .eq("user_id", user.id)
    .eq("base_id", baseId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: automations ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const baseId = typeof body?.baseId === "string" ? body.baseId : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const trigger = body?.trigger;
  const action = body?.action;

  if (!baseId || !name) return NextResponse.json({ error: "baseId and name are required" }, { status: 400 });
  if (trigger?.type !== "workload_state_entered" || !WORKLOAD_STATES.has(trigger?.state)) {
    return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
  }
  if (!ACTION_TYPES.has(action?.type)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  if (action.type === "browser_notification" && typeof action.message !== "string") {
    return NextResponse.json({ error: "action.message is required for browser_notification" }, { status: 400 });
  }
  if (action.type === "append_record" && typeof action.table_id !== "string") {
    return NextResponse.json({ error: "action.table_id is required for append_record" }, { status: 400 });
  }

  const { data: base } = await supabase.from("zenly_bases").select("id").eq("id", baseId).eq("user_id", user.id).maybeSingle();
  if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });

  const { data: automation, error } = await supabase
    .from("zenly_automations")
    .insert({ base_id: baseId, user_id: user.id, name, trigger, action, enabled: true })
    .select("id, name, enabled, trigger, action, last_fired_at, fire_count, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation });
}
