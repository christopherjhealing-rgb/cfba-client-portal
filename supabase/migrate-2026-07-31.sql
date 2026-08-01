-- Migration for databases created from the v11 schema.sql, which was missing
-- four columns the v11 code writes. Without them, lodgements and messages
-- were rejected by Postgres — and, before the same day's repo.ts fix, the
-- failures were silent. Safe to run repeatedly (idempotent).
--
-- Run in: Supabase → SQL Editor → paste → Run. Expect "Success. No rows returned".

alter table submissions add column if not exists job_class    text not null default '';
alter table submissions add column if not exists notes        text not null default '';
alter table submissions add column if not exists amendment_of text;

alter table messages    add column if not exists files        jsonb not null default '[]'::jsonb;

-- The v11 schema enabled RLS on the first seven tables only; these three were
-- added below that block and shipped unrestricted. No policies wanted — the
-- server's service-role key bypasses RLS, so the app is unaffected.
alter table messages       enable row level security;
alter table message_reads  enable row level security;
alter table login_attempts enable row level security;

-- Page-visibility switches (added later the same day).
create table if not exists portal_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table portal_settings enable row level security;

-- Audit trail.
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
