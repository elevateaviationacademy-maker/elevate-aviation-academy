-- Standing subject-level access: once granted, a student sees EVERYTHING in
-- that subject automatically, including content added after the grant — no
-- more re-running "Grant all" every time a new PDF/video goes up.
create table if not exists subject_access (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade,
  subject text not null,
  granted_by uuid references profiles(id),
  granted_at timestamptz default now(),
  unique (student_id, subject)
);

alter table subject_access enable row level security;

create policy "instructors manage subject_access" on subject_access
  for all using (public.is_instructor()) with check (public.is_instructor());

create policy "students view own subject_access" on subject_access
  for select using (auth.uid() = student_id);

-- Extend content visibility: a student can see a content row if EITHER they
-- have a specific per-item grant OR they have standing access to its subject.
drop policy if exists "students view granted content" on content;
create policy "students view granted content" on content for select using (
  exists (
    select 1 from access_grants g
    where g.content_id = content.id and g.student_id = auth.uid()
  )
  or exists (
    select 1 from subject_access sa
    where sa.subject = content.subject and sa.student_id = auth.uid()
  )
);
