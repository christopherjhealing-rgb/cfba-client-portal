-- CFBA Client Portal — Supabase schema
-- Run this once in the Supabase SQL editor.
--
-- Every table is reached through the service-role key from the Next.js server
-- only; no browser ever talks to Postgres directly. RLS is enabled with no
-- permissive policies, so an anon/public key can read nothing even if leaked.

-- ---------------------------------------------------------------------------
-- Companies: the portal's own clean client registry. This — not the free-text
-- Client column on the Monday board — is the canonical client identity.
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id          text primary key,
  name        text not null,
  is_test     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Contact addresses for a company (used to match Monday cards, and for notices)
create table if not exists company_emails (
  company_id  text not null references companies(id) on delete cascade,
  email       text primary key
);

-- Extra spellings that appear in the Monday Client column, e.g. "GVF",
-- "GVF (Joe Furfaro)". Store the normalised alias key (see lib/core.mjs).
create table if not exists company_aliases (
  company_id  text not null references companies(id) on delete cascade,
  alias_key   text not null,
  primary key (company_id, alias_key)
);

-- ---------------------------------------------------------------------------
-- Logins: one username per client company, password chosen by the client.
-- A staff-issued one-time setup code is what lets them set it.
-- ---------------------------------------------------------------------------
create table if not exists client_logins (
  username           text primary key,
  company_id         text not null references companies(id) on delete cascade,
  password_hash      text,
  must_set_password  boolean not null default true,
  setup_code_hash    text,
  setup_expires_at   timestamptz,
  disabled           boolean not null default false,
  last_login_at      timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists client_logins_company on client_logins(company_id);

-- ---------------------------------------------------------------------------
-- Jobs mirrored from the Monday board, plus the cached Issued files.
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  ref                 text primary key,
  company_id          text not null references companies(id) on delete cascade,
  monday_item_id      text,
  address             text not null default '',
  description         text not null default '',
  monday_status       text not null default '',
  file_count          integer not null default 0,
  issued_at           timestamptz,
  first_downloaded_at timestamptz,
  last_synced_at      timestamptz,
  storage_prefix      text,
  source_folder       text
);
create index if not exists jobs_company on jobs(company_id);
create index if not exists jobs_status on jobs(monday_status);

create table if not exists job_files (
  id            bigserial primary key,
  ref           text not null references jobs(ref) on delete cascade,
  filename      text not null,
  size          bigint not null default 0,
  storage_path  text not null,
  content_type  text not null default 'application/octet-stream',
  unique (ref, filename)
);

-- ---------------------------------------------------------------------------
-- Portal submissions — the review queue. Accepting one creates the Monday card.
-- ---------------------------------------------------------------------------
create table if not exists submissions (
  id              text primary key,
  company_id      text not null references companies(id) on delete cascade,
  email           text not null default '',
  address         text not null default '',
  job_class       text not null default '',
  description     text not null default '',
  notes           text not null default '',
  files           jsonb not null default '[]'::jsonb,
  status          text not null default 'pending',
  monday_item_id  text,
  review_note     text,
  amendment_of    text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);
create index if not exists submissions_status on submissions(status);

-- ---------------------------------------------------------------------------
-- Lock everything down. The server uses the service-role key, which bypasses
-- RLS; nothing else should be able to read these tables.
-- ---------------------------------------------------------------------------
alter table companies       enable row level security;
alter table company_emails  enable row level security;
alter table company_aliases enable row level security;
alter table client_logins   enable row level security;
alter table jobs            enable row level security;
alter table job_files       enable row level security;
alter table submissions     enable row level security;

-- ---------------------------------------------------------------------------
-- Seed: the CFBA test client, so you can dry-run in production too.
-- The username below has NO password yet — issue a setup code from
-- /admin/clients, or insert one here.
-- ---------------------------------------------------------------------------
insert into companies (id, name, is_test) values
  ('co_test', 'CFBA Test Client', true)
on conflict (id) do nothing;

insert into company_emails (company_id, email) values
  ('co_test', 'test@cfbuildingapprovals.com.au')
on conflict (email) do nothing;

insert into client_logins (username, company_id, must_set_password) values
  ('cfba.test', 'co_test', true)
on conflict (username) do nothing;

-- Storage: create a PRIVATE bucket named "issued" in the Supabase dashboard
-- (Storage > New bucket > uncheck "Public bucket"). Files are streamed through
-- the app after an ownership check — they are never publicly addressable.

-- ---------------------------------------------------------------------------
-- Portal v2: messages, read markers, amendments, and the FIR request text.
-- ---------------------------------------------------------------------------
alter table if exists submissions add column if not exists amendment_of text;
alter table if exists jobs        add column if not exists fir_request  text;

create table if not exists messages (
  id                text primary key,
  ref               text not null,
  company_id        text not null,
  from_side         text not null check (from_side in ('client','cfba')),
  body              text not null,
  monday_update_id  text,
  files             jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists messages_company_idx on messages (company_id, ref, created_at);

create table if not exists message_reads (
  company_id  text not null,
  ref         text not null,
  read_at     timestamptz not null default now(),
  primary key (company_id, ref)
);

-- Portal v3: login throttling.
create table if not exists login_attempts (
  username  text primary key,
  count     int  not null default 0,
  last_at   timestamptz not null default now()
);

-- RLS for the tables added after the block above. Same posture: enabled, no
-- policies — only the service-role key (server-side) can touch them.
alter table messages       enable row level security;
alter table message_reads  enable row level security;
alter table login_attempts enable row level security;

-- Staff-controlled switches, e.g. hiding a portal section while it's updated.
create table if not exists portal_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table portal_settings enable row level security;

-- Append-only audit trail: who did what, when. The record a complaint,
-- insurance claim or Building Services Board query asks for.
create table if not exists audit_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  actor   text not null default 'staff',
  action  text not null,
  target  text,
  detail  text
);
create index if not exists audit_log_at on audit_log (at desc);
alter table audit_log enable row level security;
