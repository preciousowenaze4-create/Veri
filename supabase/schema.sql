-- Run this once in your Supabase Dashboard -> SQL Editor
-- Enables persistent Naira wallets, custom @veribox.name.ng mailboxes, and inbound email storage.

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

create table if not exists public.mailboxes (
  address text primary key,
  id text not null,
  username text not null,
  domain text not null default 'veribox.name.ng',
  display_name text,
  account_mode text not null default 'personal',
  owner_user_id text,
  password_hash text not null,
  salt text not null,
  token text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_mailboxes_owner on public.mailboxes (owner_user_id);

create table if not exists public.mailbox_messages (
  id text primary key,
  recipient_address text not null,
  from_name text,
  from_address text,
  subject text not null default '(No subject)',
  body_text text not null default '',
  body_html text not null default '',
  otp text,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_mailbox_messages_recipient
  on public.mailbox_messages (recipient_address, created_at desc);

-- Enable Row Level Security with safe read policies for realtime balance updates
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.mailboxes enable row level security;
alter table public.mailbox_messages enable row level security;

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
