-- Run this whole file once in Supabase: Dashboard > SQL Editor > New query > paste > Run

-- 1. Profiles table (one row per signed-up user, links to Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  email text,
  role text not null default 'student' check (role in ('student', 'instructor')),
  created_at timestamp with time zone default now()
);

-- Auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'student');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Role-check helpers used by every RLS policy below. These are SECURITY
-- DEFINER, so they run as the function owner (the role that ran this file,
-- normally table-owning `postgres`) rather than the calling user — table
-- owners bypass RLS by default in Postgres. That's what breaks the
-- recursion: without this, a policy on `profiles` that queries `profiles`
-- to check the caller's role re-triggers RLS on that inner query, which
-- re-runs the same policy, forever (Postgres surfaces this as a 500 from
-- PostgREST, not a clear "infinite recursion" message, which is why it's
-- easy to miss).
create or replace function public.is_instructor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'instructor');
$$;

create or replace function public.is_student()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'student');
$$;

-- 2. Content table (videos, PDFs, and unlisted YouTube links the instructor adds)
create table if not exists content (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  subject text not null default 'Unsorted',  -- e.g. Meteorology, Air Regulations, Air Navigation
  type text not null check (type in ('video', 'pdf', 'youtube')),
  file_key text,                -- object key/path inside the R2 bucket (video/pdf only)
  youtube_url text,             -- unlisted YouTube URL or video ID (youtube only)
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);
create index if not exists content_subject_idx on content (subject);

-- 3. Access grants (which student can see which content)
create table if not exists access_grants (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references content(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  granted_at timestamp with time zone default now(),
  unique (content_id, student_id)
);

-- Row Level Security
alter table profiles enable row level security;
alter table content enable row level security;
alter table access_grants enable row level security;

-- Profiles: everyone can read their own profile; instructors can read all (for the access-grant picker)
create policy "read own profile" on profiles for select using (auth.uid() = id);
create policy "instructors read all profiles" on profiles for select using (
  public.is_instructor()
);

-- Content: instructors can do everything with content they created
create policy "instructors manage content" on content for all using (
  public.is_instructor()
);
-- Students can only see metadata for content they've been granted
create policy "students view granted content" on content for select using (
  exists (
    select 1 from access_grants g
    where g.content_id = content.id and g.student_id = auth.uid()
  )
);

-- Access grants: instructors manage grants; students can see their own grants
create policy "instructors manage grants" on access_grants for all using (
  public.is_instructor()
);
create policy "students view own grants" on access_grants for select using (
  auth.uid() = student_id
);

-- 4. Exams (instructor-created practice papers, pulled from the DGCA question bank)
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  chapters jsonb default '[]'::jsonb,   -- [] means "all chapters in subject"
  question_count int not null default 20,
  duration_minutes int not null default 20,
  is_active boolean not null default false,   -- gate open/closed
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);

-- 5. Exam access (which students can see/take which exam — same pattern as access_grants)
create table if not exists exam_access (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  granted_at timestamp with time zone default now(),
  unique (exam_id, student_id)
);

-- 6. Exam attempts (one row per student per exam; stores the generated paper
--    snapshot so results/review stay stable even if the question bank changes)
create table if not exists exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  questions jsonb,             -- snapshot of the generated paper (with shuffled options)
  answers jsonb default '{}'::jsonb,
  correct_count int,
  total int,
  score numeric,               -- percentage
  tab_switches int default 0,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted')),
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  unique (exam_id, student_id)
);

alter table exams enable row level security;
alter table exam_access enable row level security;
alter table exam_attempts enable row level security;

-- Exams: instructors manage everything they created (and can see all, matching the content pattern)
create policy "instructors manage exams" on exams for all using (
  public.is_instructor()
);
-- Students can see an exam only if it's open and they've been granted access
create policy "students view granted open exams" on exams for select using (
  is_active = true and exists (
    select 1 from exam_access a where a.exam_id = exams.id and a.student_id = auth.uid()
  )
);
-- ...and can still see exam metadata (title/subject) for their own past
-- attempts even after the instructor closes the gate — needed so results
-- and certificate pages keep working after an exam period ends.
create policy "students view exams they attempted" on exams for select using (
  exists (
    select 1 from exam_attempts at where at.exam_id = exams.id and at.student_id = auth.uid()
  )
);

-- Exam access: instructors manage grants; students can see their own
create policy "instructors manage exam access" on exam_access for all using (
  public.is_instructor()
);
create policy "students view own exam access" on exam_access for select using (
  auth.uid() = student_id
);

-- Exam attempts: instructors can view all attempts (for live monitoring / results review)
create policy "instructors view all attempts" on exam_attempts for select using (
  public.is_instructor()
);
-- Students can see and update only their own attempt row
create policy "students manage own attempt" on exam_attempts for all using (
  auth.uid() = student_id
);

-- 7. Announcements (instructor posts, visible to every student — simple, no targeting)
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);

alter table announcements enable row level security;

create policy "instructors manage announcements" on announcements for all using (
  public.is_instructor()
);
create policy "students read announcements" on announcements for select using (
  public.is_student()
);

-- ---------------------------------------------------------------------
-- Seeing every request fail with a 500 (not 403/401)? That's RLS infinite
-- recursion from an older version of this file, where policies checked
-- instructor status with a subquery directly on `profiles` from within a
-- policy defined on `profiles` itself. Run this once to fix it in place —
-- it's the same fix already baked into the "-- 1. Profiles" section above,
-- just as a standalone patch for a database that predates it:
--
--   create or replace function public.is_instructor()
--   returns boolean language sql security definer set search_path = public stable
--   as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'instructor'); $$;
--
--   create or replace function public.is_student()
--   returns boolean language sql security definer set search_path = public stable
--   as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'student'); $$;
--
--   drop policy if exists "instructors read all profiles" on profiles;
--   create policy "instructors read all profiles" on profiles for select using (public.is_instructor());
--   drop policy if exists "instructors manage content" on content;
--   create policy "instructors manage content" on content for all using (public.is_instructor());
--   drop policy if exists "instructors manage grants" on access_grants;
--   create policy "instructors manage grants" on access_grants for all using (public.is_instructor());
--   drop policy if exists "instructors manage exams" on exams;
--   create policy "instructors manage exams" on exams for all using (public.is_instructor());
--   drop policy if exists "instructors manage exam access" on exam_access;
--   create policy "instructors manage exam access" on exam_access for all using (public.is_instructor());
--   drop policy if exists "instructors view all attempts" on exam_attempts;
--   create policy "instructors view all attempts" on exam_attempts for select using (public.is_instructor());
--   drop policy if exists "instructors manage announcements" on announcements;
--   create policy "instructors manage announcements" on announcements for all using (public.is_instructor());
--   drop policy if exists "students read announcements" on announcements;
--   create policy "students read announcements" on announcements for select using (public.is_student());
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Already ran this file before YouTube support was added? Run this small
-- migration once (safe to re-run — it no-ops if already applied):
--
--   alter table content add column if not exists youtube_url text;
--   alter table content alter column file_key drop not null;
--   alter table content drop constraint if exists content_type_check;
--   alter table content add constraint content_type_check
--     check (type in ('video', 'pdf', 'youtube'));
--
-- Already ran this file before the certificate page was added? Run this too
-- (lets students keep viewing results/certificates after an exam gate closes):
--
--   create policy "students view exams they attempted" on exams for select using (
--     exists (
--       select 1 from exam_attempts at where at.exam_id = exams.id and at.student_id = auth.uid()
--     )
--   );
--
-- Want the Announcements feature on a database that predates it? Just run
-- the "-- 7. Announcements" block further up this file once — it's a plain
-- create-table-if-not-exists, safe alongside your existing tables.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- After running this file, promote your own account to instructor with:
--   update profiles set role = 'instructor' where email = 'you@example.com';
-- (Sign up through the app first so the row exists, then run that line.)
-- ---------------------------------------------------------------------
