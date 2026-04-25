alter table public.profiles
  add column if not exists ynab_currency_code text;
