-- profiles: one row per auth.users entry
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  ynab_token_ct   text,                       -- AES-GCM ciphertext, base64
  ynab_token_iv   text,                       -- IV (nonce), base64
  ynab_budget_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.income_settings (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  planned_income   numeric,
  baseline_months  int not null default 6,
  updated_at       timestamptz not null default now()
);

create type public.goal_status as enum ('active', 'frozen', 'completed');

create table public.goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  target_amount     numeric not null check (target_amount > 0),
  deadline          date not null,
  ynab_category_id  text,
  status            public.goal_status not null default 'active',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index goals_user_id_deadline_idx on public.goals (user_id, deadline);

create table public.ynab_cache (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  synced_at        timestamptz not null default now(),
  categories       jsonb not null default '[]'::jsonb,
  income_history   jsonb not null default '[]'::jsonb
);

create table public.plan_snapshots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  inputs_hash  text not null,
  result       jsonb not null
);
create index plan_snapshots_user_created_idx on public.plan_snapshots (user_id, created_at desc);

-- RLS
alter table public.profiles         enable row level security;
alter table public.income_settings  enable row level security;
alter table public.goals            enable row level security;
alter table public.ynab_cache       enable row level security;
alter table public.plan_snapshots   enable row level security;

create policy "self read profiles"  on public.profiles for select using (auth.uid() = id);
create policy "self write profiles" on public.profiles for all    using (auth.uid() = id) with check (auth.uid() = id);

create policy "self read income"  on public.income_settings for select using (auth.uid() = user_id);
create policy "self write income" on public.income_settings for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "self read goals"  on public.goals for select using (auth.uid() = user_id);
create policy "self write goals" on public.goals for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "self read cache"  on public.ynab_cache for select using (auth.uid() = user_id);
create policy "self write cache" on public.ynab_cache for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "self read snapshots"  on public.plan_snapshots for select using (auth.uid() = user_id);
create policy "self write snapshots" on public.plan_snapshots for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create profile row on signup
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.income_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
