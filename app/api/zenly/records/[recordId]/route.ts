import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { recordId: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const data = typeof body?.data === "object" && body.data ? body.data : null;
  if (!data) return NextResponse.json({ error: "data is required" }, { status: 400 });

  const { error } = await supabase
    .from("zenly_records")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", params.recordId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { recordId: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { error } = await supabase.from("zenly_records").delete().eq("id", params.recordId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
