-- Updates the auto-create-profile trigger so a student's batch (entered at
-- signup) gets saved into profiles automatically, the same way full_name
-- already does. Requires migration_batches.sql (adds the batch column) to
-- have been run first.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, batch)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'student', new.raw_user_meta_data->>'batch');
  return new;
end;
$$ language plpgsql security definer;
