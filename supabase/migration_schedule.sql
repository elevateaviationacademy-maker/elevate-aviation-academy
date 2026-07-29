-- Day-wise class schedule. One row per (date, subject), either a topic or a
-- holiday. Bulk-pasted or edited one day at a time from the instructor side;
-- read by students for the "today/tomorrow" dashboard banner.
create table if not exists schedule_items (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  subject text not null,
  topic text,
  is_holiday boolean not null default false,
  created_by uuid references profiles(id),
  updated_at timestamptz default now(),
  unique (date, subject)
);

alter table schedule_items enable row level security;

create policy "instructors manage schedule" on schedule_items
  for all using (public.is_instructor()) with check (public.is_instructor());

create policy "students read schedule" on schedule_items
  for select using (auth.uid() is not null);
