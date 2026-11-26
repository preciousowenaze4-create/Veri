-- Run this once in your Supabase Dashboard -> SQL Editor
-- Enables persistent Naira wallets, custom @veribox.name.ng mailboxes, inbound email storage,
-- raw inbound webhook traffic diagnostics, user moderation, and live Realtime updates.

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
  tx_type text not null default 'deposit',
  sender_user_id text,
  sender_email text,
  recipient_user_id text,
  recipient_email text,
  details text,
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions
  add column if not exists tx_type text not null default 'deposit',
  add column if not exists sender_user_id text,
  add column if not exists sender_email text,
  add column if not exists recipient_user_id text,
  add column if not exists recipient_email text,
  add column if not exists details text;

create index if not exists idx_wallet_transactions_user_id
  on public.wallet_transactions (user_id, created_at desc);
create index if not exists idx_wallet_transactions_sender_user_id
  on public.wallet_transactions (sender_user_id, created_at desc);
create index if not exists idx_wallet_transactions_recipient_user_id
  on public.wallet_transactions (recipient_user_id, created_at desc);
create index if not exists idx_wallet_transactions_created_at
  on public.wallet_transactions (created_at desc);

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
  mailbox_id text,
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

-- Ensure mailbox_id column exists even on older deployments
alter table public.mailbox_messages
  add column if not exists mailbox_id text;

create index if not exists idx_mailbox_messages_recipient
  on public.mailbox_messages (recipient_address, created_at desc);
create index if not exists idx_mailbox_messages_recipient_lower
  on public.mailbox_messages (lower(recipient_address), created_at desc);
create index if not exists idx_mailbox_messages_mailbox_id
  on public.mailbox_messages (mailbox_id, created_at desc);

create table if not exists public.inbound_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  from_address text not null default '',
  to_address text not null default '',
  subject text not null default '',
  otp_code text,
  matched_mailbox_id uuid,
  http_status integer not null default 200,
  status text not null default 'stored',
  ok boolean not null default false,
  error_reason text,
  raw_meta jsonb
);

alter table public.inbound_webhook_logs
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists from_address text not null default '',
  add column if not exists to_address text not null default '',
  add column if not exists subject text not null default '',
  add column if not exists otp_code text,
  add column if not exists matched_mailbox_id uuid,
  add column if not exists http_status integer not null default 200,
  add column if not exists status text not null default 'stored',
  add column if not exists ok boolean not null default false,
  add column if not exists error_reason text,
  add column if not exists raw_meta jsonb;

create index if not exists idx_inbound_webhook_logs_received_at
  on public.inbound_webhook_logs (received_at desc);

create table if not exists public.user_moderation (
  user_id text primary key,
  email text,
  status text not null default 'active',
  reason text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'app',
  severity text not null default 'error',
  code text,
  message text not null,
  detail text
);

create index if not exists idx_app_error_logs_created_at
  on public.app_error_logs (created_at desc);

-- Explicit schema & role grants for PostgREST + Realtime + backend service role
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on
  public.wallets,
  public.wallet_transactions,
  public.mailboxes,
  public.mailbox_messages,
  public.inbound_webhook_logs,
  public.user_moderation,
  public.app_error_logs
  to authenticated;

-- Enable Row Level Security (backend uses service role key for strict per-user isolation)
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.mailboxes enable row level security;
alter table public.created_email_registry enable row level security;
alter table public.mailbox_messages enable row level security;
alter table public.inbound_webhook_logs enable row level security;
alter table public.user_moderation enable row level security;
alter table public.app_error_logs enable row level security;

-- Full replica identity ensures Supabase Realtime WAL filters work reliably on all rows
alter table public.wallets replica identity full;
alter table public.wallet_transactions replica identity full;
alter table public.mailboxes replica identity full;
alter table public.mailbox_messages replica identity full;
alter table public.inbound_webhook_logs replica identity full;
alter table public.app_error_logs replica identity full;

do $$
begin
  drop policy if exists "Allow public read wallet by user_id" on public.wallets;
  drop policy if exists "Allow user read own wallet" on public.wallets;
  create policy "Allow user read own wallet"
    on public.wallets
    for select
    to authenticated
    using (
      user_id = auth.uid()::text
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'preciousddkid@gmail.com'
    );

  drop policy if exists "Allow user read own wallet_transactions" on public.wallet_transactions;
  create policy "Allow user read own wallet_transactions"
    on public.wallet_transactions
    for select
    to authenticated
    using (
      user_id = auth.uid()::text
      or sender_user_id = auth.uid()::text
      or recipient_user_id = auth.uid()::text
      or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or lower(coalesce(sender_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or lower(coalesce(recipient_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'preciousddkid@gmail.com'
    );

  drop policy if exists "Allow owner read own mailboxes" on public.mailboxes;
  create policy "Allow owner read own mailboxes"
    on public.mailboxes
    for select
    to authenticated
    using (
      owner_user_id = auth.uid()::text
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'preciousddkid@gmail.com'
    );

  drop policy if exists "Allow owner read own mailbox messages" on public.mailbox_messages;
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
          where (
            lower(m.address) = lower(mailbox_messages.recipient_address)
            or (mailbox_messages.mailbox_id is not null and m.id = mailbox_messages.mailbox_id)
          )
          and m.owner_user_id = auth.uid()::text
          and coalesce(m.is_deleted, false) = false
        )
      )
    );

  drop policy if exists "Allow owner admin read inbound_webhook_logs" on public.inbound_webhook_logs;
  create policy "Allow owner admin read inbound_webhook_logs"
    on public.inbound_webhook_logs
    for select
    to authenticated
    using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'preciousddkid@gmail.com');

  drop policy if exists "Allow owner admin read user_moderation" on public.user_moderation;
  create policy "Allow owner admin read user_moderation"
    on public.user_moderation
    for select
    to authenticated
    using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'preciousddkid@gmail.com');

  drop policy if exists "Allow owner admin read app_error_logs" on public.app_error_logs;
  create policy "Allow owner admin read app_error_logs"
    on public.app_error_logs
    for select
    to authenticated
    using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'preciousddkid@gmail.com');
end $$;

-- Enable Supabase Realtime on wallets, wallet_transactions, mailbox_messages, mailboxes, inbound_webhook_logs, and app_error_logs
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
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallet_transactions'
  ) then
    alter publication supabase_realtime add table public.wallet_transactions;
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
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inbound_webhook_logs'
  ) then
    alter publication supabase_realtime add table public.inbound_webhook_logs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_error_logs'
  ) then
    alter publication supabase_realtime add table public.app_error_logs;
  end if;
end $$;

-- Refresh PostgREST schema cache immediately
notify pgrst, 'reload schema';
