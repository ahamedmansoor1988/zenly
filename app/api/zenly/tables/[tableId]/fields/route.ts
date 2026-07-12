import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

const FIELD_TYPES = new Set(["text", "long_text", "number", "select", "checkbox", "date", "url"]);

export async function POST(request: NextRequest, { params }: { params: { tableId: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: table } = await supabase.from("zenly_tables").select("id, source").eq("id", params.tableId).eq("user_id", user.id).maybeSingle();
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (table.source !== "custom") return NextResponse.json({ error: "Only custom tables can have fields added" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const type = typeof body?.type === "string" ? body.type : "";
  if (!name || !FIELD_TYPES.has(type)) return NextResponse.json({ error: "name and a valid type are required" }, { status: 400 });

  const { count } = await supabase.from("zenly_fields").select("id", { count: "exact", head: true }).eq("table_id", params.tableId);

  const { data: field, error } = await supabase
    .from("zenly_fields")
    .insert({
      table_id: params.tableId,
      user_id: user.id,
      name,
      type,
      options: typeof body?.options === "object" && body.options ? body.options : {},
      position: count ?? 0,
    })
    .select("id, name, type, options, position")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ field });
}
