-- Run once in a new Supabase project before creating classroom accounts.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  student_number text unique,
  role text not null check (role in ('teacher', 'student')),
  created_at timestamptz not null default now(),
  constraint profiles_student_number_by_role check (
    (role = 'teacher' and student_number is null)
    or (role = 'student' and student_number is not null)
  )
);

create unique index if not exists profiles_single_teacher
  on public.profiles ((role))
  where role = 'teacher';

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  subject text not null check (char_length(btrim(subject)) between 2 and 80),
  day_of_week smallint not null check (day_of_week between 1 and 5),
  start_time time not null,
  end_time time not null,
  topic text not null default '' check (char_length(topic) <= 500),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint schedules_end_after_start check (end_time > start_time)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 150),
  description text not null check (char_length(btrim(description)) between 2 and 5000),
  published_at timestamptz not null default now(),
  due_at timestamptz not null,
  attachment_path text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint assignments_due_after_publish check (due_at >= published_at)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  submission_text text not null default '' check (char_length(submission_text) <= 10000),
  file_path text,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted', 'late', 'reviewed')),
  grade numeric(5, 2) check (grade is null or grade between 0 and 100),
  feedback text check (feedback is null or char_length(feedback) <= 5000),
  unique (assignment_id, student_id)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete restrict,
  attendance_date date not null default current_date,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (student_id, attendance_date)
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 150),
  description text not null default '' check (char_length(description) <= 2000),
  resource_url text not null check (char_length(resource_url) <= 2048),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 150),
  content text not null check (char_length(btrim(content)) between 2 and 5000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.showcase (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null check (char_length(btrim(description)) between 2 and 2000),
  project_url text not null default '' check (char_length(project_url) <= 2048),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists schedules_day_start_idx on public.schedules (day_of_week, start_time);
create index if not exists profiles_role_name_idx on public.profiles (role, full_name);
create index if not exists assignments_publish_due_idx on public.assignments (published_at, due_at);
create index if not exists submissions_student_idx on public.submissions (student_id, submitted_at desc);
create index if not exists submissions_assignment_idx on public.submissions (assignment_id, status);
create index if not exists attendance_date_student_idx on public.attendance (attendance_date, student_id);
create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists showcase_review_created_idx on public.showcase (review_status, created_at desc);

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
  );
$$;

revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

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
  );
$$;

revoke all on function public.is_classroom_user() from public;
grant execute on function public.is_classroom_user() to authenticated;

create or replace function public.set_submission_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_due timestamptz;
begin
  if tg_op = 'UPDATE' and (select public.is_teacher()) then
    return new;
  end if;

  select due_at into assignment_due
  from public.assignments
  where id = new.assignment_id;

  if not found then
    raise exception 'Assignment not found';
  end if;

  new.submitted_at := now();
  new.status := case when new.submitted_at > assignment_due then 'late' else 'submitted' end;
  new.grade := null;
  new.feedback := null;
  return new;
end;
$$;

revoke all on function public.set_submission_status() from public;

drop trigger if exists submissions_set_status on public.submissions;
create trigger submissions_set_status
  before insert or update of submission_text, file_path on public.submissions
  for each row execute function public.set_submission_status();

create or replace function public.review_submission(
  target_submission uuid,
  new_grade numeric,
  new_feedback text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Only the teacher can review submissions' using errcode = '42501';
  end if;

  if new_grade is not null and (new_grade < 0 or new_grade > 100) then
    raise exception 'Grade must be between 0 and 100';
  end if;

  if new_feedback is not null and char_length(new_feedback) > 5000 then
    raise exception 'Feedback is too long';
  end if;

  update public.submissions
  set grade = new_grade,
      feedback = nullif(btrim(new_feedback), ''),
      status = 'reviewed'
  where id = target_submission;

  if not found then
    raise exception 'Submission not found';
  end if;
end;
$$;

revoke all on function public.review_submission(uuid, numeric, text) from public;
grant execute on function public.review_submission(uuid, numeric, text) to authenticated;

create or replace function public.review_showcase(
  target_project uuid,
  approve_project boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Only the teacher can review showcase entries' using errcode = '42501';
  end if;

  update public.showcase
  set review_status = case when approve_project then 'approved' else 'rejected' end
  where id = target_project;

  if not found then
    raise exception 'Showcase entry not found';
  end if;
end;
$$;

revoke all on function public.review_showcase(uuid, boolean) from public;
grant execute on function public.review_showcase(uuid, boolean) to authenticated;

create or replace function public.get_teacher_showcase()
returns table (
  id uuid,
  student_name text,
  student_number text,
  title text,
  description text,
  project_url text,
  review_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Only the teacher can view showcase submitter details' using errcode = '42501';
  end if;

  return query
  select s.id, p.full_name, p.student_number, s.title, s.description,
    s.project_url, s.review_status, s.created_at
  from public.showcase s
  join public.profiles p on p.id = s.student_id
  order by s.created_at desc;
end;
$$;

revoke all on function public.get_teacher_showcase() from public;
grant execute on function public.get_teacher_showcase() to authenticated;

create or replace function public.set_attendance_recorder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_teacher()) then
    raise exception 'Only the teacher can record attendance' using errcode = '42501';
  end if;
  new.recorded_by := (select auth.uid());
  return new;
end;
$$;

revoke all on function public.set_attendance_recorder() from public;

drop trigger if exists attendance_set_recorder on public.attendance;
create trigger attendance_set_recorder
  before insert or update of recorded_by on public.attendance
  for each row execute function public.set_attendance_recorder();

alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.attendance enable row level security;
alter table public.resources enable row level security;
alter table public.announcements enable row level security;
alter table public.showcase enable row level security;

revoke all on table public.profiles, public.schedules, public.assignments,
  public.submissions, public.attendance, public.resources,
  public.announcements, public.showcase from anon, authenticated;

grant select on public.profiles, public.schedules, public.assignments,
  public.submissions, public.attendance, public.resources,
  public.announcements, public.showcase to authenticated;
revoke select on public.showcase from authenticated;
grant select (id, title, description, project_url, review_status, created_at)
  on public.showcase to authenticated;

grant update (full_name, student_number) on public.profiles to authenticated;
grant insert, update, delete on public.schedules, public.assignments,
  public.resources, public.announcements to authenticated;
grant insert (assignment_id, student_id, submission_text, file_path)
  on public.submissions to authenticated;
grant update (submission_text, file_path) on public.submissions to authenticated;
grant insert (student_id, attendance_date, status, recorded_by),
  update (status, recorded_by), delete on public.attendance to authenticated;
grant insert (student_id, title, description, project_url),
  update (title, description, project_url) on public.showcase to authenticated;

drop policy if exists "Profiles visible to owner and teacher" on public.profiles;
drop policy if exists "Users can read their own profile or teacher can read all" on public.profiles;
create policy "Profiles visible to owner and teacher"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_teacher()));
drop policy if exists "Teacher updates profile details" on public.profiles;
create policy "Teacher updates profile details"
  on public.profiles for update to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

drop policy if exists "Classroom users read schedules" on public.schedules;
create policy "Classroom users read schedules"
  on public.schedules for select to authenticated
  using ((select public.is_classroom_user()));
drop policy if exists "Teacher manages schedules" on public.schedules;
create policy "Teacher manages schedules"
  on public.schedules for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()) and created_by = (select auth.uid()));

drop policy if exists "Classroom users read published assignments" on public.assignments;
create policy "Classroom users read published assignments"
  on public.assignments for select to authenticated
  using (
    (select public.is_teacher())
    or ((select public.is_classroom_user()) and published_at <= now())
  );
drop policy if exists "Teacher manages assignments" on public.assignments;
create policy "Teacher manages assignments"
  on public.assignments for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()) and created_by = (select auth.uid()));

drop policy if exists "Students see own and teacher sees all submissions" on public.submissions;
create policy "Students see own and teacher sees all submissions"
  on public.submissions for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_teacher()));
drop policy if exists "Students submit only for themselves" on public.submissions;
create policy "Students submit only for themselves"
  on public.submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
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
    and status <> 'reviewed'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
  )
  with check (student_id = (select auth.uid()) and status <> 'reviewed');

drop policy if exists "Students see own attendance and teacher sees all" on public.attendance;
create policy "Students see own attendance and teacher sees all"
  on public.attendance for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_teacher()));
drop policy if exists "Teacher manages attendance" on public.attendance;
create policy "Teacher manages attendance"
  on public.attendance for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

drop policy if exists "Classroom users read resources" on public.resources;
create policy "Classroom users read resources"
  on public.resources for select to authenticated
  using ((select public.is_classroom_user()));
drop policy if exists "Teacher manages resources" on public.resources;
create policy "Teacher manages resources"
  on public.resources for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()) and created_by = (select auth.uid()));

drop policy if exists "Classroom users read announcements" on public.announcements;
create policy "Classroom users read announcements"
  on public.announcements for select to authenticated
  using ((select public.is_classroom_user()));
drop policy if exists "Teacher manages announcements" on public.announcements;
create policy "Teacher manages announcements"
  on public.announcements for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()) and created_by = (select auth.uid()));

drop policy if exists "Users see approved or own showcase entries" on public.showcase;
create policy "Users see approved or own showcase entries"
  on public.showcase for select to authenticated
  using (
    (select public.is_teacher())
    or review_status = 'approved'
    or student_id = (select auth.uid())
  );
drop policy if exists "Students submit own showcase entries" on public.showcase;
create policy "Students submit own showcase entries"
  on public.showcase for insert to authenticated
  with check (
    student_id = (select auth.uid())
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
    and review_status = 'pending'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
  )
  with check (student_id = (select auth.uid()) and review_status = 'pending');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('assignment-files', 'assignment-files', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'text/plain']),
  ('submission-files', 'submission-files', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'text/plain'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Teachers manage assignment attachments" on storage.objects;
create policy "Teachers manage assignment attachments"
  on storage.objects for all to authenticated
  using (bucket_id = 'assignment-files' and (select public.is_teacher()))
  with check (bucket_id = 'assignment-files' and (select public.is_teacher()));
drop policy if exists "Classroom users read published assignment attachments" on storage.objects;
create policy "Classroom users read published assignment attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'assignment-files'
    and (select public.is_classroom_user())
    and exists (
      select 1 from public.assignments a
      where a.attachment_path = name
        and a.published_at <= now()
    )
  );
drop policy if exists "Students upload their own submission files" on storage.objects;
create policy "Students upload their own submission files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submission-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
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
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'student'
    )
  );
