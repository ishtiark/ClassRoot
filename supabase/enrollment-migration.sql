-- Run once after schema.sql to enable student requests and managed access.
begin;

alter table public.profiles
  add column if not exists active boolean not null default true;

create table if not exists public.enrollment_requests (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete restrict
);

create index if not exists enrollment_requests_status_created_idx
  on public.enrollment_requests (status, created_at);

alter table public.enrollment_requests enable row level security;
revoke all on table public.enrollment_requests from anon, authenticated;
grant select on public.enrollment_requests to authenticated;

drop policy if exists "Users see their own enrollment request and teacher sees all"
  on public.enrollment_requests;
create policy "Users see their own enrollment request and teacher sees all"
  on public.enrollment_requests for select to authenticated
  using (id = (select auth.uid()) or (select public.is_teacher()));

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'teacher'
      and active
  );
$$;

create or replace function public.is_classroom_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active
  );
$$;

create or replace function public.create_enrollment_request_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  if coalesce(new.raw_user_meta_data ->> 'request_student_access', 'false') <> 'true' then
    return new;
  end if;

  requested_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  if requested_name is null or char_length(requested_name) not between 2 and 100 then
    requested_name := left(split_part(coalesce(new.email, 'Student'), '@', 1), 100);
  end if;
  if char_length(requested_name) < 2 then
    requested_name := 'Student';
  end if;

  insert into public.enrollment_requests (id, email, full_name)
  values (new.id, coalesce(new.email, ''), requested_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_enrollment_request_for_auth_user() from public;
drop trigger if exists create_classroom_enrollment_request on auth.users;
create trigger create_classroom_enrollment_request
  after insert on auth.users
  for each row execute function public.create_enrollment_request_for_auth_user();

create or replace function public.approve_enrollment_request(
  target_request uuid,
  assigned_student_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.enrollment_requests%rowtype;
begin
  if not (select public.is_teacher()) then
    raise exception 'Only the teacher can approve student requests' using errcode = '42501';
  end if;

  if assigned_student_number is null
    or assigned_student_number !~ '^[A-Za-z0-9._-]{1,50}$' then
    raise exception 'Student number must use 1–50 letters, numbers, dots, underscores, or hyphens.';
  end if;

  select *
  into request_row
  from public.enrollment_requests
  where id = target_request
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception 'This student request is no longer pending.';
  end if;

  if exists (select 1 from public.profiles where id = target_request) then
    raise exception 'This account already has a classroom profile.';
  end if;

  insert into public.profiles (id, full_name, student_number, role, active)
  values (target_request, request_row.full_name, assigned_student_number, 'student', true);

  update public.enrollment_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = (select auth.uid())
  where id = target_request;
end;
$$;

revoke all on function public.approve_enrollment_request(uuid, text) from public;
grant execute on function public.approve_enrollment_request(uuid, text) to authenticated;

create or replace function public.reject_enrollment_request(target_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Only the teacher can reject student requests' using errcode = '42501';
  end if;

  update public.enrollment_requests
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = (select auth.uid())
  where id = target_request
    and status = 'pending';

  if not found then
    raise exception 'This student request is no longer pending.';
  end if;
end;
$$;

revoke all on function public.reject_enrollment_request(uuid) from public;
grant execute on function public.reject_enrollment_request(uuid) to authenticated;

create or replace function public.set_student_access(target_student uuid, enable_access boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Only the teacher can change student access' using errcode = '42501';
  end if;

  update public.profiles
  set active = enable_access
  where id = target_student
    and role = 'student';

  if not found then
    raise exception 'Student profile not found.';
  end if;
end;
$$;

revoke all on function public.set_student_access(uuid, boolean) from public;
grant execute on function public.set_student_access(uuid, boolean) to authenticated;

drop policy if exists "Students see own and teacher sees all submissions" on public.submissions;
create policy "Students see own and teacher sees all submissions"
  on public.submissions for select to authenticated
  using (
    (student_id = (select auth.uid()) and (select public.is_classroom_user()))
    or (select public.is_teacher())
  );

drop policy if exists "Students submit only for themselves" on public.submissions;
create policy "Students submit only for themselves"
  on public.submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.is_classroom_user())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
    and exists (
      select 1 from public.assignments
      where id = assignment_id and published_at <= now()
    )
  );

drop policy if exists "Students edit own submissions" on public.submissions;
create policy "Students edit own submissions"
  on public.submissions for update to authenticated
  using (
    student_id = (select auth.uid())
    and (select public.is_classroom_user())
    and status <> 'reviewed'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
  )
  with check (
    student_id = (select auth.uid())
    and (select public.is_classroom_user())
    and status <> 'reviewed'
  );

drop policy if exists "Students see own attendance and teacher sees all" on public.attendance;
create policy "Students see own attendance and teacher sees all"
  on public.attendance for select to authenticated
  using (
    (student_id = (select auth.uid()) and (select public.is_classroom_user()))
    or (select public.is_teacher())
  );

drop policy if exists "Users see approved or own showcase entries" on public.showcase;
create policy "Users see approved or own showcase entries"
  on public.showcase for select to authenticated
  using (
    (select public.is_teacher())
    or (
      (select public.is_classroom_user())
      and (review_status = 'approved' or student_id = (select auth.uid()))
    )
  );

drop policy if exists "Students submit own showcase entries" on public.showcase;
create policy "Students submit own showcase entries"
  on public.showcase for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.is_classroom_user())
    and review_status = 'pending'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
  );

drop policy if exists "Students edit own pending showcase entries" on public.showcase;
create policy "Students edit own pending showcase entries"
  on public.showcase for update to authenticated
  using (
    student_id = (select auth.uid())
    and (select public.is_classroom_user())
    and review_status = 'pending'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
  )
  with check (
    student_id = (select auth.uid())
    and (select public.is_classroom_user())
    and review_status = 'pending'
  );

drop policy if exists "Students upload their own submission files" on storage.objects;
create policy "Students upload their own submission files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submission-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_classroom_user())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
    and exists (
      select 1 from public.assignments a
      where a.id::text = (storage.foldername(name))[2]
        and a.published_at <= now()
    )
  );

drop policy if exists "Students and teacher read submission files" on storage.objects;
create policy "Students and teacher read submission files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'submission-files'
    and (
      (select public.is_teacher())
      or (
        (storage.foldername(name))[1] = (select auth.uid())::text
        and (select public.is_classroom_user())
        and exists (
          select 1 from public.submissions s
          where s.student_id = (select auth.uid())
            and s.file_path = name
        )
      )
    )
  );

drop policy if exists "Students delete their own submission files" on storage.objects;
create policy "Students delete their own submission files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'submission-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_classroom_user())
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
  );

commit;
