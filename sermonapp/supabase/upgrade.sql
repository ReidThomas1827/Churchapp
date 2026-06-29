-- One-time upgrade for an existing Sermon Notes database.
-- Adds the columns/table for: speaker, pin-for-quiz, and nested folders.
-- Safe to run more than once (everything is "if not exists").
-- Paste into the Supabase SQL Editor and Run.

alter table sermons add column if not exists speaker text;
alter table sermons add column if not exists quiz_pinned boolean default false;
alter table sermons add column if not exists folder_id text;

create table if not exists folders (
  id text primary key,
  name text not null,
  parent_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
