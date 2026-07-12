import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { tableId: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: table } = await supabase.from("zenly_tables").select("id, source").eq("id", params.tableId).eq("user_id", user.id).maybeSingle();
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
  if (table.source !== "custom") return NextResponse.json({ error: "This table is read-only" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const data = typeof body?.data === "object" && body.data ? body.data : {};

  const { data: record, error } = await supabase
    .from("zenly_records")
    .insert({ table_id: params.tableId, user_id: user.id, data })
    .select("id, data, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record });
}
