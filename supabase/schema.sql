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

alter table public.profiles enable row level security;

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

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

drop policy if exists "Users can read their own profile or teacher can read all" on public.profiles;
create policy "Users can read their own profile or teacher can read all"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_teacher()));
