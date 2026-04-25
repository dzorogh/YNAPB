alter table public.goals
  add column last_sync_status text not null default 'synced'
  check (last_sync_status in ('synced', 'error'));

alter table public.goals
  add column last_sync_error text;

alter table public.goals
  add column last_synced_at timestamptz;

update public.goals
set last_synced_at = now()
where last_sync_status = 'synced' and last_synced_at is null;
