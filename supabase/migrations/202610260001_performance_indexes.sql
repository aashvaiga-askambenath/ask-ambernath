create index if not exists businesses_public_created_idx
  on public.businesses (created_at desc)
  where is_active = true and verification_status = 'verified' and online = true;

create index if not exists orders_business_created_idx
  on public.orders (business_id, created_at desc);

create index if not exists orders_created_idx
  on public.orders (created_at desc);

create index if not exists profiles_created_idx
  on public.profiles (created_at desc);

create index if not exists support_requests_created_idx
  on public.support_requests (created_at desc);

create index if not exists support_requests_user_idx
  on public.support_requests (user_id);

create index if not exists reviews_created_idx
  on public.reviews (created_at desc);
