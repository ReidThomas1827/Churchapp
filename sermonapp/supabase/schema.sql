-- Sermon Notes — Supabase schema. Paste into the Supabase SQL Editor and run.
--
-- Personal / single-user setup: the app talks to these tables with the anon key
-- and RLS is left OFF for simplicity. Keep your Supabase URL and keys private
-- (the app stores them in the browser, not in the repo). To lock it down later,
-- enable RLS + Supabase Auth and scope rows to auth.uid().
--
-- Tables are denormalized to mirror the app's local records, so sync is a simple
-- 1:1 upsert. Audio is NOT stored here — it stays on the device.

create extension if not exists vector;

create table if not exists sermons (
  id text primary key,
  title text not null,
  kind text default 'Sermon',
  date date not null,
  attended boolean not null default true,
  status text not null default 'recorded',
  duration_sec numeric default 0,
  transcript text,
  notes jsonb,
  mime_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists study_plan (
  id text primary key,
  date date not null,
  reference text not null,
  status text not null default 'planned',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists quiz_history (
  id text primary key,
  source_type text not null,         -- 'sermon' | 'study'
  title text,
  score int,
  total int,
  taken_at timestamptz default now()
);

-- Web Push subscriptions (Phase 4).
create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Per-day notification schedule. Times are minutes-since-local-midnight so the
-- cron only needs to compare against the current local time.
create table if not exists notify_schedule (
  day date primary key,
  sermon_min int,
  study_min int,
  sermon_sent boolean default false,
  study_sent boolean default false
);

-- Embeddings for global AI search (Phase 6). Gemini text-embedding-004 = 768 dims.
create table if not exists embeddings (
  id text primary key,
  source_type text not null,         -- 'sermon'
  source_id text,
  chunk_text text,
  embedding vector(768),
  created_at timestamptz default now()
);

create index if not exists embeddings_vec_idx
  on embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function match_embeddings(query_embedding vector(768), match_count int default 8)
returns table (source_type text, source_id text, chunk_text text, similarity float)
language sql stable as $$
  select source_type, source_id, chunk_text, 1 - (embedding <=> query_embedding) as similarity
  from embeddings
  order by embedding <=> query_embedding
  limit match_count;
$$;
