alter table public.job_listings
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected'));

create index if not exists job_listings_owner_created_idx
  on public.job_listings (owner_id, created_at desc);

drop policy if exists "job_listings_public_active" on public.job_listings;
create policy "job_listings_public_active" on public.job_listings for select to anon, authenticated
  using (is_active and approval_status = 'approved');

drop policy if exists "job_listings_owner_read" on public.job_listings;
create policy "job_listings_owner_read" on public.job_listings for select to authenticated
  using (owner_id = auth.uid());
