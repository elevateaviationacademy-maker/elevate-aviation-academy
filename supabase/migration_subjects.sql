-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query > Run)
-- Safe to run even if you already have content/students — it only adds a column.

alter table content
  add column if not exists subject text;

-- Existing rows (added before this migration) won't have a subject yet.
-- Give them a placeholder so they still show up somewhere instead of disappearing:
update content set subject = 'Unsorted' where subject is null;

alter table content
  alter column subject set not null,
  alter column subject set default 'Unsorted';

create index if not exists content_subject_idx on content (subject);
