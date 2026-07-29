-- Adds a subject to each schedule day, and allows more than one subject's
-- topic to be scheduled on the same date (e.g. Meteorology AND Air
-- Navigation both have a session on 2026-08-10).
alter table schedule_items add column if not exists subject text;
update schedule_items set subject = coalesce(subject, 'Unsorted');
alter table schedule_items alter column subject set not null;

alter table schedule_items drop constraint if exists schedule_items_date_key;
alter table schedule_items add constraint schedule_items_date_subject_key unique (date, subject);
