create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('customer', 'business_owner', 'admin', 'super_admin')),
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon_key text not null default 'store',
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  tagline text not null default '',
  description text not null default '',
  phone text not null,
  whatsapp_phone text,
  email text,
  address_line text not null,
  area text not null,
  city text not null default 'Ambernath',
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  latitude double precision,
  longitude double precision,
  logo_url text,
  cover_image_url text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'under_review', 'verified', 'rejected', 'suspended')),
  online boolean not null default false,
  approval_notes text,
  average_rating numeric(3,2) not null default 0 check (average_rating between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  compare_price numeric(12,2) check (compare_price is null or compare_price >= price),
  unit_label text,
  estimated_time text,
  image_url text,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_closed boolean not null default false,
  open_time time,
  close_time time,
  unique (business_id, day_of_week),
  check (is_closed or (open_time is not null and close_time is not null))
);

create table public.business_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_type text not null,
  file_url text not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  recipient_name text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  landmark text,
  area text not null,
  city text not null default 'Ambernath',
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  idempotency_key uuid not null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  status text not null default 'Pending'
    check (status in ('Pending', 'Accepted', 'Rejected', 'Preparing', 'Scheduled', 'In Progress', 'Out for Delivery', 'Completed', 'Cancelled')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  platform_fee numeric(12,2) not null default 0 check (platform_fee >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method text not null check (payment_method in ('cash_on_service', 'upi_on_service', 'razorpay')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'refunded', 'failed')),
  customer_name text not null,
  customer_phone text not null,
  delivery_address jsonb not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid references public.business_services(id) on delete set null,
  item_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  old_status text,
  new_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.favorites (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, business_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index businesses_public_search_idx on public.businesses (verification_status, is_active, online, category_id, area);
create index businesses_owner_created_idx on public.businesses (owner_id, created_at desc);
create index businesses_slug_idx on public.businesses (slug);
create index business_services_business_availability_idx on public.business_services (business_id, is_available, sort_order);
create index business_documents_business_status_idx on public.business_documents (business_id, verification_status);
create index customer_addresses_owner_created_idx on public.customer_addresses (customer_id, is_default desc, created_at desc);
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_business_status_created_idx on public.orders (business_id, status, created_at desc);
create index order_items_order_idx on public.order_items (order_id);
create index order_events_order_created_idx on public.order_events (order_id, created_at);
create index favorites_business_idx on public.favorites (business_id);
create index reviews_business_visible_idx on public.reviews (business_id, is_visible, created_at desc);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index admin_activity_created_idx on public.admin_activity (created_at desc);
create index support_requests_status_created_idx on public.support_requests (status, created_at desc);

insert into public.categories (name, slug, icon_key, sort_order) values
  ('Water Supply', 'water', 'droplets', 1),
  ('Home Services', 'home-services', 'wrench', 2),
  ('Electrician', 'electrician', 'zap', 3),
  ('AC Technician', 'ac-technician', 'snowflake', 4),
  ('Tiffin & Home Food', 'food', 'utensils', 5),
  ('Tuition', 'tuition', 'book-open', 6),
  ('Travel & Transport', 'travel', 'car', 7),
  ('Salon & Wellness', 'salon', 'scissors', 8),
  ('Bakery & Cakes', 'bakery', 'cake', 9),
  ('Events & Decoration', 'events', 'party-popper', 10),
  ('Workshops & Manufacturing', 'workshops', 'factory', 11),
  ('Other Local Services', 'other', 'store', 12)
on conflict (slug) do nothing;

insert into public.app_settings (key, value) values
  ('platform_fee', '0'::jsonb),
  ('delivery_fee', '0'::jsonb),
  ('service_city', '"Ambernath"'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger businesses_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger business_services_updated_at before update on public.business_services for each row execute function public.set_updated_at();
create trigger business_documents_updated_at before update on public.business_documents for each row execute function public.set_updated_at();
create trigger customer_addresses_updated_at before update on public.customer_addresses for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create trigger support_requests_updated_at before update on public.support_requests for each row execute function public.set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'requested_role';
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    case when requested_role = 'business_owner' then 'business_owner' else 'customer' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin') and is_active
  );
$$;

create or replace function public.refresh_business_rating()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  affected_business uuid := coalesce(new.business_id, old.business_id);
begin
  update public.businesses
  set average_rating = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where business_id = affected_business and is_visible), 0),
      rating_count = (select count(*) from public.reviews where business_id = affected_business and is_visible)
  where id = affected_business;
  return coalesce(new, old);
end;
$$;

create trigger reviews_refresh_business_rating
after insert or update or delete on public.reviews
for each row execute function public.refresh_business_rating();

create or replace function public.create_order(
  p_customer_id uuid,
  p_business_id uuid,
  p_items jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address jsonb,
  p_notes text,
  p_payment_method text,
  p_idempotency_key uuid
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  business_row public.businesses%rowtype;
  service_row public.business_services%rowtype;
  item_record record;
  existing_order public.orders%rowtype;
  subtotal_amount numeric(12,2) := 0;
  platform_fee_amount numeric(12,2) := 0;
  delivery_fee_amount numeric(12,2) := 0;
  order_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_customer_id then
    raise exception using errcode = '42501', message = 'You can only order for your own account';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'Order must contain between 1 and 50 items';
  end if;
  if p_payment_method not in ('cash_on_service', 'upi_on_service') then
    raise exception using errcode = '22023', message = 'Unsupported payment method';
  end if;
  if jsonb_typeof(p_delivery_address) <> 'object'
     or length(trim(coalesce(p_delivery_address ->> 'address_line_1', ''))) < 5
     or length(trim(coalesce(p_delivery_address ->> 'area', ''))) < 2
     or length(trim(coalesce(p_customer_name, ''))) < 2
     or length(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g')) < 8 then
    raise exception using errcode = '22023', message = 'Customer contact and service address are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text || p_idempotency_key::text, 0));
  select * into existing_order from public.orders
  where customer_id = p_customer_id and idempotency_key = p_idempotency_key;
  if found then return next existing_order; return; end if;

  select * into business_row from public.businesses
  where id = p_business_id and is_active and online and verification_status = 'verified'
  for share;
  if not found then raise exception using errcode = 'P0002', message = 'Business is not accepting orders'; end if;

  for item_record in
    select "serviceId" as service_id, quantity from jsonb_to_recordset(p_items) as items("serviceId" uuid, quantity integer)
  loop
    if item_record.quantity is null or item_record.quantity < 1 or item_record.quantity > 99 then
      raise exception using errcode = '22023', message = 'Item quantity must be between 1 and 99';
    end if;
    select * into service_row from public.business_services
    where id = item_record.service_id and business_id = p_business_id and is_available
    for share;
    if not found then raise exception using errcode = 'P0002', message = 'A selected service is unavailable'; end if;
    subtotal_amount := subtotal_amount + service_row.price * item_record.quantity;
  end loop;

  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'platform_fee'), 0)
    into platform_fee_amount;
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'delivery_fee'), 0)
    into delivery_fee_amount;

  insert into public.orders (
    order_number, idempotency_key, customer_id, business_id, status, subtotal, delivery_fee,
    platform_fee, discount, total, payment_method, payment_status, customer_name, customer_phone,
    delivery_address, notes
  ) values (
    'AMB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    p_idempotency_key, p_customer_id, p_business_id, 'Pending', subtotal_amount, delivery_fee_amount,
    platform_fee_amount, 0, subtotal_amount + delivery_fee_amount + platform_fee_amount, p_payment_method,
    'unpaid', left(trim(p_customer_name), 100), left(trim(p_customer_phone), 20), p_delivery_address,
    left(coalesce(p_notes, ''), 1000)
  ) returning id into order_id;

  for item_record in
    select "serviceId" as service_id, quantity from jsonb_to_recordset(p_items) as items("serviceId" uuid, quantity integer)
  loop
    select * into service_row from public.business_services where id = item_record.service_id and business_id = p_business_id;
    insert into public.order_items (order_id, service_id, item_name, unit_price, quantity, line_total)
    values (order_id, service_row.id, service_row.name, service_row.price, item_record.quantity, service_row.price * item_record.quantity);
  end loop;
  insert into public.order_events (order_id, actor_id, old_status, new_status, note)
  values (order_id, p_customer_id, null, 'Pending', 'Order placed');
  insert into public.notifications (user_id, type, title, message, data)
  values (business_row.owner_id, 'new_order', 'New order received', 'A customer placed an order.', jsonb_build_object('order_id', order_id));
  return query select * from public.orders where id = order_id;
end;
$$;

create or replace function public.transition_order(
  p_order_id uuid,
  p_actor_id uuid,
  p_new_status text,
  p_note text default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  business_owner_id uuid;
  actor_role text;
  allowed boolean := false;
begin
  if auth.uid() is null or auth.uid() <> p_actor_id then
    raise exception using errcode = '42501', message = 'Invalid actor';
  end if;
  select role into actor_role from public.profiles where id = p_actor_id and is_active;
  if actor_role is null then raise exception using errcode = '42501', message = 'Account is unavailable'; end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found'; end if;
  select owner_id into business_owner_id from public.businesses where id = order_row.business_id;
  if actor_role = 'customer' and order_row.customer_id = p_actor_id then
    allowed := order_row.status = 'Pending' and p_new_status = 'Cancelled';
  elsif actor_role = 'business_owner' and business_owner_id = p_actor_id then
    allowed := case order_row.status
      when 'Pending' then p_new_status in ('Accepted', 'Rejected')
      when 'Accepted' then p_new_status in ('Preparing', 'Scheduled', 'In Progress', 'Cancelled')
      when 'Preparing' then p_new_status in ('Out for Delivery', 'Completed', 'Cancelled')
      when 'Scheduled' then p_new_status in ('In Progress', 'Cancelled')
      when 'In Progress' then p_new_status in ('Completed', 'Cancelled')
      when 'Out for Delivery' then p_new_status in ('Completed', 'Cancelled')
      else false
    end;
  elsif actor_role in ('admin', 'super_admin') then
    allowed := case order_row.status
      when 'Pending' then p_new_status in ('Accepted', 'Rejected', 'Cancelled')
      when 'Accepted' then p_new_status in ('Preparing', 'Scheduled', 'In Progress', 'Cancelled')
      when 'Preparing' then p_new_status in ('Out for Delivery', 'Completed', 'Cancelled')
      when 'Scheduled' then p_new_status in ('In Progress', 'Cancelled')
      when 'In Progress' then p_new_status in ('Completed', 'Cancelled')
      when 'Out for Delivery' then p_new_status in ('Completed', 'Cancelled')
      else false
    end;
  end if;
  if not allowed then raise exception using errcode = '42501', message = 'This order status change is not allowed'; end if;

  update public.orders set status = p_new_status where id = p_order_id;
  insert into public.order_events (order_id, actor_id, old_status, new_status, note)
  values (p_order_id, p_actor_id, order_row.status, p_new_status, left(p_note, 500));
  insert into public.notifications (user_id, type, title, message, data)
  values (
    case when actor_role = 'customer' then business_owner_id else order_row.customer_id end,
    'order_status', 'Order status updated', 'Your order is now ' || p_new_status || '.',
    jsonb_build_object('order_id', p_order_id, 'status', p_new_status)
  );
  if actor_role in ('admin', 'super_admin') then
    insert into public.admin_activity (actor_id, action, entity_type, entity_id, metadata)
    values (
      p_actor_id, 'order_status_updated', 'order', p_order_id,
      jsonb_build_object('old_status', order_row.status, 'new_status', p_new_status)
    );
  end if;
  return query select * from public.orders where id = p_order_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.businesses enable row level security;
alter table public.business_services enable row level security;
alter table public.business_hours enable row level security;
alter table public.business_documents enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_activity enable row level security;
alter table public.support_requests enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles_select_self_or_admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_platform_admin());
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated
using (id = auth.uid() or public.is_platform_admin())
with check (id = auth.uid() or public.is_platform_admin());

create policy "categories_public_active" on public.categories for select to anon, authenticated using (is_active);
create policy "categories_admin_all" on public.categories for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "businesses_public_eligible" on public.businesses for select to anon, authenticated
using (is_active and online and verification_status = 'verified');
create policy "businesses_owner_read" on public.businesses for select to authenticated using (owner_id = auth.uid());
create policy "businesses_admin_all" on public.businesses for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "services_public_available" on public.business_services for select to anon, authenticated
using (is_available and exists (
  select 1 from public.businesses b where b.id = business_id and b.is_active and b.online and b.verification_status = 'verified'
));
create policy "services_owner_read" on public.business_services for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy "services_admin_all" on public.business_services for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "hours_public_eligible" on public.business_hours for select to anon, authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.is_active and b.online and b.verification_status = 'verified'));
create policy "hours_owner_read" on public.business_hours for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy "hours_admin_all" on public.business_hours for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "documents_owner_read" on public.business_documents for select to authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy "documents_admin_read" on public.business_documents for select to authenticated using (public.is_platform_admin());

create policy "addresses_owner_all" on public.customer_addresses for all to authenticated
using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy "orders_customer_or_business_read" on public.orders for select to authenticated
using (
  customer_id = auth.uid()
  or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  or public.is_platform_admin()
);
create policy "order_items_related_read" on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (
  o.customer_id = auth.uid()
  or exists (select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid())
  or public.is_platform_admin()
)));
create policy "order_events_related_read" on public.order_events for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (
  o.customer_id = auth.uid()
  or exists (select 1 from public.businesses b where b.id = o.business_id and b.owner_id = auth.uid())
  or public.is_platform_admin()
)));

create policy "favorites_owner_all" on public.favorites for all to authenticated
using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy "reviews_public_visible" on public.reviews for select to anon, authenticated
using (is_visible and exists (
  select 1 from public.businesses b where b.id = business_id and b.is_active and b.verification_status = 'verified'
));
create policy "reviews_customer_read" on public.reviews for select to authenticated using (customer_id = auth.uid());
create policy "reviews_admin_all" on public.reviews for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "notifications_owner_all" on public.notifications for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_admin_insert" on public.notifications for insert to authenticated
with check (public.is_platform_admin());
create policy "admin_activity_admin_read" on public.admin_activity for select to authenticated using (public.is_platform_admin());
create policy "admin_activity_admin_insert" on public.admin_activity for insert to authenticated
with check (public.is_platform_admin() and actor_id = auth.uid());
create policy "support_request_user_read" on public.support_requests for select to authenticated using (user_id = auth.uid());
create policy "support_request_admin_all" on public.support_requests for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "app_settings_admin_all" on public.app_settings for all to authenticated
using (public.is_platform_admin()) with check (public.is_platform_admin());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.categories, public.businesses, public.business_services, public.business_hours, public.reviews to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses, public.favorites to authenticated;
grant select on public.orders, public.order_items, public.order_events, public.notifications, public.business_documents, public.admin_activity, public.support_requests to authenticated;
grant insert on public.notifications, public.admin_activity to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
revoke all on function public.create_order(uuid, uuid, jsonb, text, text, jsonb, text, text, uuid) from public, anon;
grant execute on function public.create_order(uuid, uuid, jsonb, text, text, jsonb, text, text, uuid) to authenticated;
revoke all on function public.transition_order(uuid, uuid, text, text) from public, anon;
grant execute on function public.transition_order(uuid, uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-media', 'business-media', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('verification-documents', 'verification-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "business_media_public_read" on storage.objects for select to anon, authenticated
using (bucket_id = 'business-media');
create policy "business_media_owner_upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-media'
  and exists (select 1 from public.businesses b where b.id::text = split_part(name, '/', 1) and b.owner_id = auth.uid())
);
create policy "business_media_owner_update" on storage.objects for update to authenticated
using (
  bucket_id = 'business-media'
  and exists (select 1 from public.businesses b where b.id::text = split_part(name, '/', 1) and b.owner_id = auth.uid())
)
with check (
  bucket_id = 'business-media'
  and exists (select 1 from public.businesses b where b.id::text = split_part(name, '/', 1) and b.owner_id = auth.uid())
);
create policy "verification_owner_upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'verification-documents'
  and exists (select 1 from public.businesses b where b.id::text = split_part(name, '/', 1) and b.owner_id = auth.uid())
);
create policy "verification_owner_or_admin_read" on storage.objects for select to authenticated
using (
  bucket_id = 'verification-documents'
  and (public.is_platform_admin() or exists (
    select 1 from public.businesses b where b.id::text = split_part(name, '/', 1) and b.owner_id = auth.uid()
  ))
);
