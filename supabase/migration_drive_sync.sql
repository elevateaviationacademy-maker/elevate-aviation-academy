-- Google Drive sync: lets an instructor map a Drive folder to each subject,
-- then pull files from it into the same protected R2-backed content library
-- used by manual uploads (so watermark / no-download protections still apply).

create table if not exists drive_folders (
  id uuid primary key default gen_random_uuid(),
  subject text not null unique,
  folder_id text not null,
  folder_url text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  last_synced_at timestamptz
);

-- Tracks which Drive files have already been imported, so re-running sync
-- only pulls in files that are new since last time.
create table if not exists drive_synced_files (
  drive_file_id text primary key,
  content_id uuid references content(id) on delete cascade,
  subject text not null,
  synced_at timestamptz default now()
);

alter table drive_folders enable row level security;
alter table drive_synced_files enable row level security;

create policy "instructors manage drive_folders" on drive_folders
  for all using (public.is_instructor()) with check (public.is_instructor());

create policy "instructors manage drive_synced_files" on drive_synced_files
  for all using (public.is_instructor()) with check (public.is_instructor());
