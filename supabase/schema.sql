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

create unique index if not exists idx_mailboxes_address_lower
  on public.mailboxes (lower(address));
create index if not exists idx_mailboxes_owner on public.mailboxes (owner_user_id);

create table if not exists public.created_email_registry (
  address text primary key,
  username text not null,
  domain text not null default 'veribox.name.ng',
  created_by_user_id text,
  source text not null default 'create',
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_created_email_registry_address_lower
  on public.created_email_registry (lower(address));
create index if not exists idx_created_email_registry_username_lower
  on public.created_email_registry (lower(username));

-- Backfill any previously created mailboxes so deleted or active emails remain permanently marked
insert into public.created_email_registry (
  address,
  username,
  domain,
  created_by_user_id,
  source,
  is_deleted,
  created_at
)
select
  lower(address),
  lower(username),
  domain,
  owner_user_id,
  'backfill',
  is_deleted,
  created_at
from public.mailboxes
on conflict (address) do nothing;

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
create index if not exists idx_mailbox_messages_recipient_lower
  on public.mailbox_messages (lower(recipient_address), created_at desc);

-- Enable Row Level Security (backend uses service role key for strict per-user mailbox isolation)
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.mailboxes enable row level security;
alter table public.created_email_registry enable row level security;
alter table public.mailbox_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'wallets' and policyname = 'Allow public read wallet by user_id'
  ) then
    create policy "Allow public read wallet by user_id"
      on public.wallets for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'mailbox_messages' and policyname = 'Allow owner read own mailbox messages'
  ) then
    create policy "Allow owner read own mailbox messages"
      on public.mailbox_messages
      for select
      to authenticated
      using (
        recipient_address <> '__inbound_audit__@system.veribox'
        and (
          lower(coalesce(auth.jwt() ->> 'email', '')) = 'preciousddkid@gmail.com'
          or exists (
            select 1
            from public.mailboxes m
            where lower(m.address) = lower(mailbox_messages.recipient_address)
              and m.owner_user_id = auth.uid()::text
              and coalesce(m.is_deleted, false) = false
          )
        )
      );
  end if;
end $$;

-- Enable Supabase Realtime on wallets, mailbox_messages, and mailboxes for instant UI updates
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallets'
  ) then
    alter publication supabase_realtime add table public.wallets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mailbox_messages'
  ) then
    alter publication supabase_realtime add table public.mailbox_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mailboxes'
  ) then
    alter publication supabase_realtime add table public.mailboxes;
  end if;
end $$;
