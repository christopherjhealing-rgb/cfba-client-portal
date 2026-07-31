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
