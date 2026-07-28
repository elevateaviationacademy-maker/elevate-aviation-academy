-- Instructor-authored questions, stored separately from the static
-- data/questions.json bank so they don't require a redeploy to add. These
-- get merged into the same pool generatePaper() draws from at exam-start
-- time — same auto-grading, same answer-key behavior, no special casing
-- needed anywhere else in the app.
create table if not exists custom_questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  chapter text not null,
  question text not null,
  options jsonb not null,          -- array of option strings, e.g. ["A", "B", "C", "D"]
  correct_answer text not null,    -- must exactly match one of the strings in options
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table custom_questions enable row level security;

create policy "instructors manage custom_questions" on custom_questions
  for all using (public.is_instructor()) with check (public.is_instructor());
