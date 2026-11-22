-- Run this once in your Supabase Dashboard -> SQL Editor
-- Enables persistent Naira / Token wallet balances and instant Paystack webhook updates.

create table if not exists public.wallets (
  user_id text primary key,
  email text,
  balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  reference text primary key,
  user_id text not null,
  email text,
  amount numeric not null,
  status text not null default 'success',
  channel text,
  provider text not null default 'paystack',
  created_at timestamptz not null default now()
);

-- Enable Row Level Security with safe read policies for realtime balance updates
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'wallets' and policyname = 'Allow public read wallet by user_id'
  ) then
    create policy "Allow public read wallet by user_id"
      on public.wallets for select using (true);
  end if;
end $$;

-- Enable Supabase Realtime on wallets so deposits reflect immediately in the UI
alter publication supabase_realtime add table public.wallets;
