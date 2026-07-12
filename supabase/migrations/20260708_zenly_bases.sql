-- Airtable-like base/table/field/record model, plus a first-class automations engine.
-- Scoped tightly to Zenly: every base belongs to one user, RLS enforced throughout.

create table if not exists zenly_bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  icon text not null default 'layout-grid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists zenly_tables (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references zenly_bases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default 'table',
  -- 'custom' tables store rows in zenly_records. 'workload_log' is a virtual
  -- table rendered live from zenly_workload_snapshots — no rows duplicated.
  source text not null default 'custom' check (source in ('custom', 'workload_log')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists zenly_fields (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references zenly_tables(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text', 'long_text', 'number', 'select', 'checkbox', 'date', 'url')),
  -- for 'select' fields: {"choices": [{"label": "...", "color": "..."}]}
  options jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists zenly_records (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references zenly_tables(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- field_id (as text key) -> value
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists zenly_automations (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references zenly_bases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  -- {"type": "workload_state_entered", "state": "overloaded" | "busy" | "after_hours" | "focused" | "calm"}
  trigger jsonb not null,
  -- {"type": "browser_notification", "message": "..."} |
  -- {"type": "append_record", "table_id": "...", "values": {field_id: value}}
  action jsonb not null,
  last_fired_at timestamptz,
  fire_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zenly_bases_user_idx on zenly_bases (user_id);
create index if not exists zenly_tables_base_idx on zenly_tables (base_id, position);
create index if not exists zenly_fields_table_idx on zenly_fields (table_id, position);
create index if not exists zenly_records_table_idx on zenly_records (table_id, created_at desc);
create index if not exists zenly_automations_base_idx on zenly_automations (base_id);

alter table zenly_bases enable row level security;
alter table zenly_tables enable row level security;
alter table zenly_fields enable row level security;
alter table zenly_records enable row level security;
alter table zenly_automations enable row level security;

drop policy if exists "zenly bases are user scoped" on zenly_bases;
create policy "zenly bases are user scoped" on zenly_bases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "zenly tables are user scoped" on zenly_tables;
create policy "zenly tables are user scoped" on zenly_tables
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "zenly fields are user scoped" on zenly_fields;
create policy "zenly fields are user scoped" on zenly_fields
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "zenly records are user scoped" on zenly_records;
create policy "zenly records are user scoped" on zenly_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "zenly automations are user scoped" on zenly_automations;
create policy "zenly automations are user scoped" on zenly_automations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
