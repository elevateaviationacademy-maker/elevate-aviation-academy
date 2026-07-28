-- Students can leave a comment/doubt on any content item (PDF/video/YouTube)
-- they have access to. Instructors can see and delete all of them; students
-- only see and manage their own — this is a one-way doubt box, not a public
-- discussion thread between students.
create table if not exists content_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references content(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  comment text not null,
  created_at timestamptz default now()
);

alter table content_comments enable row level security;

create policy "students manage own comments" on content_comments
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

create policy "instructors view all comments" on content_comments
  for select using (public.is_instructor());

create policy "instructors delete comments" on content_comments
  for delete using (public.is_instructor());
