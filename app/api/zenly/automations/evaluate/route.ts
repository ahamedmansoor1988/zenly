import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

const WORKLOAD_STATES = new Set(["calm", "focused", "busy", "overloaded", "after_hours"]);
const REFIRE_COOLDOWN_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const baseId = typeof body?.baseId === "string" ? body.baseId : "";
  const state = typeof body?.state === "string" ? body.state : "";
  if (!baseId || !WORKLOAD_STATES.has(state)) {
    return NextResponse.json({ error: "baseId and a valid state are required" }, { status: 400 });
  }

  const { data: automations, error } = await supabase
    .from("zenly_automations")
    .select("id, trigger, action, last_fired_at, fire_count")
    .eq("user_id", user.id)
    .eq("base_id", baseId)
    .eq("enabled", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const matching = (automations ?? []).filter((row) => {
    const trigger = row.trigger as { type?: string; state?: string };
    if (trigger?.type !== "workload_state_entered" || trigger?.state !== state) return false;
    if (row.last_fired_at && now - new Date(row.last_fired_at).getTime() < REFIRE_COOLDOWN_MS) return false;
    return true;
  });

  const notifications: string[] = [];
  const firedIds: string[] = [];

  for (const automation of matching) {
    const action = automation.action as { type: string; message?: string; table_id?: string; values?: Record<string, unknown> };

    if (action.type === "browser_notification" && action.message) {
      notifications.push(action.message);
      firedIds.push(automation.id);
    } else if (action.type === "append_record" && action.table_id) {
      const { data: table } = await supabase
        .from("zenly_tables")
        .select("id, source")
        .eq("id", action.table_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (table && table.source === "custom") {
        await supabase.from("zenly_records").insert({
          table_id: table.id,
          user_id: user.id,
          data: action.values ?? {},
        });
        firedIds.push(automation.id);
      }
    }
  }

  if (firedIds.length > 0) {
    const nowIso = new Date().toISOString();
    await Promise.all(
      firedIds.map(async (id) => {
        const current = matching.find((row) => row.id === id);
        await supabase
          .from("zenly_automations")
          .update({ last_fired_at: nowIso, fire_count: (current?.fire_count ?? 0) + 1 })
          .eq("id", id)
          .eq("user_id", user.id);
      }),
    );
  }

  return NextResponse.json({ notifications, fired: firedIds.length });
}
