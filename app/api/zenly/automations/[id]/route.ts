import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  if (typeof body?.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim().slice(0, 80);
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.from("zenly_automations").update(updates).eq("id", params.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { error } = await supabase.from("zenly_automations").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
