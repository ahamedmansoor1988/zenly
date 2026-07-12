import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { supabase, user: null } as const;
  }
  return { supabase, user: data.user } as const;
}

const DEFAULT_FIELDS: Record<string, Array<{ name: string; type: string; options?: Record<string, unknown> }>> = {
  reflections: [
    { name: "Note", type: "long_text" },
    { name: "Mood", type: "select", options: { choices: [{ label: "Calm" }, { label: "Focused" }, { label: "Stretched" }, { label: "Drained" }] } },
    { name: "Date", type: "date" },
  ],
};

export async function ensureDefaultBase(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: existing } = await supabase.from("zenly_bases").select("id").eq("user_id", userId).limit(1);
  if (existing && existing.length > 0) return;

  const { data: base, error: baseError } = await supabase
    .from("zenly_bases")
    .insert({ user_id: userId, name: "Wellness", description: "Your workload history and wind-down reflections.", icon: "leaf" })
    .select("id")
    .single();
  if (baseError || !base) return;

  const { data: workloadTable } = await supabase
    .from("zenly_tables")
    .insert({ base_id: base.id, user_id: userId, name: "Workload Log", icon: "activity", source: "workload_log", position: 0 })
    .select("id")
    .single();
  void workloadTable;

  const { data: reflectionsTable } = await supabase
    .from("zenly_tables")
    .insert({ base_id: base.id, user_id: userId, name: "Reflections", icon: "notebook", source: "custom", position: 1 })
    .select("id")
    .single();

  if (reflectionsTable) {
    const fields = DEFAULT_FIELDS.reflections.map((field, index) => ({
      table_id: reflectionsTable.id,
      user_id: userId,
      name: field.name,
      type: field.type,
      options: field.options ?? {},
      position: index,
    }));
    await supabase.from("zenly_fields").insert(fields);
  }
}
