alter table public.businesses
  alter column owner_id drop not null,
  drop constraint businesses_owner_id_fkey,
  add constraint businesses_owner_id_fkey
    foreign key (owner_id) references public.profiles(id) on delete set null;

alter table public.orders
  drop constraint orders_customer_id_fkey,
  add constraint orders_customer_id_fkey
    foreign key (customer_id) references public.profiles(id) on delete cascade;

alter table public.reviews
  drop constraint reviews_order_id_fkey,
  add constraint reviews_order_id_fkey
    foreign key (order_id) references public.orders(id) on delete cascade,
  drop constraint reviews_customer_id_fkey,
  alter column customer_id drop not null,
  add constraint reviews_customer_id_fkey
    foreign key (customer_id) references public.profiles(id) on delete cascade;

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns table (business_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role text;
begin
  select role into profile_role
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_NOT_FOUND';
  end if;
  if profile_role not in ('customer', 'business_owner') then
    raise exception using errcode = '42501', message = 'ACCOUNT_ROLE_NOT_ALLOWED';
  end if;

  update public.support_requests
  set user_id = null,
      name = 'Deleted user',
      phone = '',
      email = null,
      subject = 'Account deleted',
      message = '[Message removed after account deletion]',
      updated_at = now()
  where user_id = p_user_id;

  if profile_role = 'business_owner' then
    perform id
    from public.businesses
    where owner_id = p_user_id
    order by id
    for update;

    if exists (
      select 1
      from public.orders as orders
      join public.businesses as businesses on businesses.id = orders.business_id
      where businesses.owner_id = p_user_id
        and (
          orders.status not in ('Completed', 'Rejected', 'Cancelled')
          or orders.payment_status = 'pending'
        )
    ) then
      raise exception using errcode = 'P0001', message = 'ACCOUNT_HAS_OPEN_BUSINESS_ORDERS';
    end if;

    update public.businesses
    set is_active = false, online = false
    where owner_id = p_user_id;

    return query
    select businesses.id
    from public.businesses as businesses
    where businesses.owner_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
