import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

const WORKLOAD_LOG_FIELDS = [
  { id: "captured_at", name: "Captured At", type: "date" },
  { id: "state", name: "State", type: "select", options: { choices: [{ label: "calm" }, { label: "focused" }, { label: "busy" }, { label: "overloaded" }, { label: "after_hours" }] } },
  { id: "overload_score", name: "Overload Score", type: "number" },
  { id: "communication_load", name: "Communication Load", type: "number" },
  { id: "activity_load", name: "Activity Load", type: "number" },
  { id: "duration_load", name: "Duration Load", type: "number" },
];

export async function GET(request: NextRequest, { params }: { params: { tableId: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: table } = await supabase
    .from("zenly_tables")
    .select("id, name, icon, source, base_id")
    .eq("id", params.tableId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  if (table.source === "workload_log") {
    const { data: snapshots, error } = await supabase
      .from("zenly_workload_snapshots")
      .select("id, captured_at, state, overload_score, communication_load, activity_load, duration_load")
      .eq("user_id", user.id)
      .order("captured_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const records = (snapshots ?? []).map((row) => ({
      id: row.id,
      data: {
        captured_at: row.captured_at,
        state: row.state,
        overload_score: Math.round(row.overload_score),
        communication_load: Math.round(row.communication_load),
        activity_load: Math.round(row.activity_load),
        duration_load: Math.round(row.duration_load),
      },
    }));
    return NextResponse.json({ table, fields: WORKLOAD_LOG_FIELDS, records, readOnly: true });
  }

  const [{ data: fields, error: fieldsError }, { data: records, error: recordsError }] = await Promise.all([
    supabase.from("zenly_fields").select("id, name, type, options, position").eq("table_id", table.id).order("position", { ascending: true }),
    supabase.from("zenly_records").select("id, data, created_at").eq("table_id", table.id).order("created_at", { ascending: false }).limit(500),
  ]);

  if (fieldsError) return NextResponse.json({ error: fieldsError.message }, { status: 500 });
  if (recordsError) return NextResponse.json({ error: recordsError.message }, { status: 500 });

  return NextResponse.json({ table, fields: fields ?? [], records: records ?? [], readOnly: false });
}

export async function PATCH(request: NextRequest, { params }: { params: { tableId: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const updates: Record<string, string> = {};
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim().slice(0, 80);
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.from("zenly_tables").update(updates).eq("id", params.tableId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { tableId: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: table } = await supabase.from("zenly_tables").select("source").eq("id", params.tableId).eq("user_id", user.id).maybeSingle();
  if (table?.source === "workload_log") return NextResponse.json({ error: "The Workload Log table can't be deleted" }, { status: 400 });

  const { error } = await supabase.from("zenly_tables").delete().eq("id", params.tableId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
