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
