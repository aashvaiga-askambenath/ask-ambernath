alter table public.support_requests
  add column if not exists ticket_number text unique
  not null default ('AA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));

create table if not exists public.job_listings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 5000),
  location text not null check (char_length(location) between 2 and 120),
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'contract', 'internship')),
  wage_min numeric(12,2) not null check (wage_min >= 0),
  wage_max numeric(12,2) not null check (wage_max >= wage_min),
  wage_period text not null check (wage_period in ('hour', 'day', 'month')),
  requirements text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_listings(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  message text not null default '',
  status text not null default 'received' check (status in ('received', 'reviewing', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists job_listings_active_created_idx on public.job_listings (is_active, created_at desc);
create index if not exists job_applications_created_idx on public.job_applications (created_at desc);
create index if not exists job_applications_job_id_idx on public.job_applications (job_id, created_at desc);

drop trigger if exists job_listings_updated_at on public.job_listings;
create trigger job_listings_updated_at before update on public.job_listings
for each row execute function public.set_updated_at();

alter table public.job_listings enable row level security;
alter table public.job_applications enable row level security;

drop policy if exists "job_listings_public_active" on public.job_listings;
create policy "job_listings_public_active" on public.job_listings for select to anon, authenticated
using (is_active);
drop policy if exists "job_listings_admin_all" on public.job_listings;
create policy "job_listings_admin_all" on public.job_listings for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "job_applications_admin_all" on public.job_applications;
create policy "job_applications_admin_all" on public.job_applications for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.job_listings to anon, authenticated;
grant insert, update, delete on public.job_listings to authenticated;
grant select on public.job_applications to authenticated;
