-- Lets an instructor tag students into batches/cohorts (e.g. "Aug 2026",
-- "Morning Batch") so subject access can be granted to a whole batch at
-- once instead of one student at a time.
alter table profiles add column if not exists batch text;
