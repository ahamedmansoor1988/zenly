import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/zenly/base-auth";

export const dynamic = "force-dynamic";

const FIELD_TYPES = new Set(["text", "long_text", "number", "select", "checkbox", "date", "url"]);

export async function GET(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const baseId = request.nextUrl.searchParams.get("baseId");
  if (!baseId) return NextResponse.json({ error: "baseId is required" }, { status: 400 });

  const { data: tables, error } = await supabase
    .from("zenly_tables")
    .select("id, name, icon, source, position")
    .eq("user_id", user.id)
    .eq("base_id", baseId)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tables: tables ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const baseId = typeof body?.baseId === "string" ? body.baseId : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!baseId || !name) return NextResponse.json({ error: "baseId and name are required" }, { status: 400 });

  const { data: base } = await supabase.from("zenly_bases").select("id").eq("id", baseId).eq("user_id", user.id).maybeSingle();
  if (!base) return NextResponse.json({ error: "Base not found" }, { status: 404 });

  const { count } = await supabase.from("zenly_tables").select("id", { count: "exact", head: true }).eq("base_id", baseId);

  const { data: table, error } = await supabase
    .from("zenly_tables")
    .insert({
      base_id: baseId,
      user_id: user.id,
      name,
      icon: typeof body?.icon === "string" ? body.icon.slice(0, 40) : "table",
      source: "custom",
      position: count ?? 0,
    })
    .select("id, name, icon, source, position")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rawFields = Array.isArray(body?.fields) ? body.fields : [];
  if (rawFields.length > 0) {
    const fields = rawFields
      .filter((f: unknown): f is { name: string; type: string } => {
        const field = f as { name?: unknown; type?: unknown };
        return typeof field.name === "string" && typeof field.type === "string" && FIELD_TYPES.has(field.type);
      })
      .slice(0, 20)
      .map((field: { name: string; type: string; options?: Record<string, unknown> }, index: number) => ({
        table_id: table.id,
        user_id: user.id,
        name: field.name.slice(0, 60),
        type: field.type,
        options: field.options ?? {},
        position: index,
      }));
    if (fields.length > 0) await supabase.from("zenly_fields").insert(fields);
  }

  return NextResponse.json({ table });
}
