import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultBase, requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  await ensureDefaultBase(supabase, user.id);

  const { data: bases, error } = await supabase
    .from("zenly_bases")
    .select("id, name, description, icon, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bases: bases ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: base, error } = await supabase
    .from("zenly_bases")
    .insert({
      user_id: user.id,
      name,
      description: typeof body?.description === "string" ? body.description.slice(0, 300) : null,
      icon: typeof body?.icon === "string" ? body.icon.slice(0, 40) : "layout-grid",
    })
    .select("id, name, description, icon, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ base });
}
