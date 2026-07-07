create table if not exists zenly_connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'slack')),
  provider_account_id text,
  display_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  signal_snapshot jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists zenly_workload_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'web' check (source in ('web', 'tauri', 'import')),
  captured_at timestamptz not null default now(),
  communication_load numeric not null check (communication_load >= 0 and communication_load <= 100),
  activity_load numeric not null check (activity_load >= 0 and activity_load <= 100),
  duration_load numeric not null check (duration_load >= 0 and duration_load <= 100),
  recovery_credit numeric not null check (recovery_credit >= 0 and recovery_credit <= 100),
  overload_score numeric not null check (overload_score >= 0 and overload_score <= 100),
  state text not null check (state in ('calm', 'focused', 'busy', 'overloaded', 'after_hours')),
  gmail_signals jsonb not null default '{}'::jsonb,
  slack_signals jsonb not null default '{}'::jsonb,
  input_activity jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists zenly_connected_accounts_user_provider_idx
  on zenly_connected_accounts (user_id, provider);

create index if not exists zenly_workload_snapshots_user_captured_idx
  on zenly_workload_snapshots (user_id, captured_at desc);

alter table zenly_connected_accounts enable row level security;
alter table zenly_workload_snapshots enable row level security;

drop policy if exists "zenly connected accounts are user scoped" on zenly_connected_accounts;
create policy "zenly connected accounts are user scoped"
  on zenly_connected_accounts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "zenly workload snapshots are user scoped" on zenly_workload_snapshots;
create policy "zenly workload snapshots are user scoped"
  on zenly_workload_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
