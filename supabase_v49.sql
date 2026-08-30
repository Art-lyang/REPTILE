begin;

do $guard$
begin
  if to_regclass('public.access_codes') is null then
    raise exception 'v49 requires the access_codes schema';
  end if;
end
$guard$;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.billing_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name_i18n jsonb not null default '{}'::jsonb
    check (jsonb_typeof(name_i18n) = 'object'),
  description_i18n jsonb not null default '{}'::jsonb
    check (jsonb_typeof(description_i18n) = 'object'),
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.billing_products(id) on delete restrict,
  code text not null unique
    check (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  currency text not null default 'KRW'
    check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor >= 0),
  interval_unit text not null default 'one_time'
    check (interval_unit in ('one_time', 'month', 'year')),
  interval_count smallint not null default 1
    check (interval_count between 1 and 24),
  access_days integer
    check (access_days is null or access_days between 1 and 3660),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  price_id uuid not null references public.billing_prices(id) on delete restrict,
  idempotency_key text not null
    check (char_length(idempotency_key) between 8 and 128),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded', 'expired')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  product_code text not null
    check (product_code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  interval_unit text not null
    check (interval_unit in ('one_time', 'month', 'year')),
  interval_count smallint not null check (interval_count between 1 and 24),
  access_days integer check (access_days is null or access_days between 1 and 3660),
  expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_orders_user_id_idempotency_key_key
    unique (user_id, idempotency_key)
);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid not null references public.billing_orders(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  provider_transaction_id text not null
    check (char_length(provider_transaction_id) between 1 and 160),
  status text not null
    check (status in ('captured', 'cancelled', 'partially_refunded', 'refunded', 'failed')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  approved_at timestamptz,
  cancelled_at timestamptz,
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payments_provider_transaction_key
    unique (provider, provider_transaction_id)
);

create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  payment_id uuid not null references public.billing_payments(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  provider_refund_id text
    check (provider_refund_id is null or char_length(provider_refund_id) <= 160),
  status text not null default 'requested'
    check (status in ('requested', 'succeeded', 'failed', 'cancelled')),
  amount_minor bigint not null check (amount_minor > 0),
  reason_code text check (reason_code is null or char_length(reason_code) <= 80),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_refunds_provider_refund_key
    unique (provider, provider_refund_id)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  product_id uuid not null references public.billing_products(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  provider_subscription_id text not null
    check (char_length(provider_subscription_id) between 1 and 160),
  status text not null
    check (status in ('pending', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_provider_key
    unique (provider, provider_subscription_id),
  constraint billing_subscriptions_period_ck check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null
    check (entitlement_key ~ '^[a-z0-9][a-z0-9_.-]{1,63}$'),
  source_type text not null
    check (source_type in ('premium_code', 'payment', 'subscription', 'admin')),
  source_id text not null check (char_length(source_id) between 1 and 160),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_source_key
    unique (source_type, source_id, entitlement_key),
  constraint user_entitlements_window_ck
    check (ends_at is null or ends_at > starts_at)
);

create table if not exists private.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  event_id text not null check (char_length(event_id) between 1 and 180),
  event_type text not null check (char_length(event_type) between 1 and 100),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_verified boolean not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 1000),
  processing_started_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  created_at timestamptz not null default now(),
  constraint billing_webhook_events_provider_event_key unique (provider, event_id)
);

alter table public.billing_payments
  add column if not exists webhook_event_id uuid;
do $payment_event_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_payments_webhook_event_fkey'
      and conrelid = 'public.billing_payments'::regclass
  ) then
    alter table public.billing_payments
      add constraint billing_payments_webhook_event_fkey
      foreign key (webhook_event_id) references private.billing_webhook_events(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_payments_webhook_event_key'
      and conrelid = 'public.billing_payments'::regclass
  ) then
    alter table public.billing_payments
      add constraint billing_payments_webhook_event_key unique (webhook_event_id);
  end if;
end
$payment_event_constraints$;

create index if not exists billing_prices_product_id_idx
  on public.billing_prices(product_id);
create index if not exists billing_orders_user_created_idx
  on public.billing_orders(user_id, created_at desc);
create index if not exists billing_orders_price_id_idx
  on public.billing_orders(price_id);
create index if not exists billing_orders_pending_idx
  on public.billing_orders(status, expires_at) where status = 'pending';
create index if not exists billing_payments_user_created_idx
  on public.billing_payments(user_id, created_at desc);
create index if not exists billing_payments_order_id_idx
  on public.billing_payments(order_id);
create index if not exists billing_refunds_user_created_idx
  on public.billing_refunds(user_id, created_at desc);
create index if not exists billing_refunds_payment_id_idx
  on public.billing_refunds(payment_id);
create index if not exists billing_subscriptions_user_status_idx
  on public.billing_subscriptions(user_id, status, current_period_end desc);
create index if not exists billing_subscriptions_product_id_idx
  on public.billing_subscriptions(product_id);
create index if not exists user_entitlements_user_active_idx
  on public.user_entitlements(user_id, entitlement_key, ends_at desc)
  where status = 'active' and revoked_at is null;
create index if not exists billing_webhook_events_status_idx
  on private.billing_webhook_events(status, processing_started_at);

alter table public.billing_products enable row level security;
alter table public.billing_prices enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_refunds enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.user_entitlements enable row level security;
alter table private.billing_webhook_events enable row level security;

drop policy if exists billing_products_catalog_select on public.billing_products;
create policy billing_products_catalog_select on public.billing_products
  for select to authenticated using (active = true);
drop policy if exists billing_prices_catalog_select on public.billing_prices;
create policy billing_prices_catalog_select on public.billing_prices
  for select to authenticated using (
    active = true and exists (
      select 1 from public.billing_products product
      where product.id = product_id and product.active = true
    )
  );
drop policy if exists billing_orders_own_select on public.billing_orders;
create policy billing_orders_own_select on public.billing_orders
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists billing_payments_own_select on public.billing_payments;
create policy billing_payments_own_select on public.billing_payments
  for select to authenticated using (
    exists (
      select 1 from public.billing_orders own_order
      where own_order.id = order_id
        and own_order.user_id = (select auth.uid())
    )
  );
drop policy if exists billing_refunds_own_select on public.billing_refunds;
create policy billing_refunds_own_select on public.billing_refunds
  for select to authenticated using (
    exists (
      select 1
      from public.billing_payments own_payment
      join public.billing_orders own_order on own_order.id = own_payment.order_id
      where own_payment.id = payment_id
        and own_order.user_id = (select auth.uid())
    )
  );
drop policy if exists billing_subscriptions_own_select on public.billing_subscriptions;
create policy billing_subscriptions_own_select on public.billing_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_entitlements_own_select on public.user_entitlements;
create policy user_entitlements_own_select on public.user_entitlements
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.billing_products from public, anon, authenticated;
revoke all on public.billing_prices from public, anon, authenticated;
revoke all on public.billing_orders from public, anon, authenticated;
revoke all on public.billing_payments from public, anon, authenticated;
revoke all on public.billing_refunds from public, anon, authenticated;
revoke all on public.billing_subscriptions from public, anon, authenticated;
revoke all on public.user_entitlements from public, anon, authenticated;
revoke all on private.billing_webhook_events from public, anon, authenticated;

grant select on public.billing_products to authenticated;
grant select on public.billing_prices to authenticated;
grant select on public.billing_orders to authenticated;
grant select on public.billing_payments to authenticated;
grant select on public.billing_refunds to authenticated;
grant select on public.billing_subscriptions to authenticated;
grant select on public.user_entitlements to authenticated;
grant usage on schema private to anon, authenticated, service_role;
grant select, insert, update on private.billing_webhook_events to service_role;

create or replace function private.billing_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.billing_touch_updated_at() from public, anon, authenticated;

do $triggers$
declare table_name text;
begin
  foreach table_name in array array[
    'billing_products', 'billing_prices', 'billing_orders', 'billing_payments',
    'billing_refunds', 'billing_subscriptions', 'user_entitlements'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.billing_touch_updated_at()',
      table_name || '_touch_updated_at', table_name
    );
  end loop;
end
$triggers$;

create or replace function private.create_billing_order(
  p_user_id uuid,
  p_price_code text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  price_row record;
  order_row public.billing_orders;
  recent_count integer;
begin
  if p_user_id is null or p_user_id is distinct from (select auth.uid()) then
    raise exception 'BILLING_LOGIN_REQUIRED';
  end if;
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 8 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'BILLING_IDEMPOTENCY_KEY_INVALID';
  end if;

  select
    price.id, price.amount_minor, price.currency,
    price.access_days, price.interval_unit, price.interval_count,
    product.entitlement_key, product.code as product_code
    into price_row
    from public.billing_prices price
    join public.billing_products product on product.id = price.product_id
   where price.code = lower(btrim(p_price_code))
     and price.active = true and product.active = true;
  if not found then raise exception 'BILLING_PRICE_NOT_FOUND'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('billing-order:' || p_user_id::text, 0)
  );

  select * into order_row
    from public.billing_orders
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if order_row.price_id <> price_row.id then
      raise exception 'BILLING_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', order_row.id, 'status', order_row.status,
      'amount_minor', order_row.amount_minor, 'currency', order_row.currency,
      'expires_at', order_row.expires_at
    );
  end if;

  select count(*) into recent_count
    from public.billing_orders
   where user_id = p_user_id and created_at > now() - interval '1 hour';
  if recent_count >= 20 then
    raise exception 'BILLING_ORDER_RATE_LIMIT';
  end if;

  insert into public.billing_orders(
    user_id, price_id, idempotency_key, status,
    amount_minor, currency, entitlement_key, product_code,
    access_days, interval_unit, interval_count, expires_at
  ) values (
    p_user_id, price_row.id, p_idempotency_key, 'pending',
    price_row.amount_minor, price_row.currency,
    price_row.entitlement_key, price_row.product_code,
    price_row.access_days, price_row.interval_unit, price_row.interval_count,
    now() + interval '15 minutes'
  )
  on conflict on constraint billing_orders_user_id_idempotency_key_key do nothing
  returning * into order_row;

  if not found then
    select * into order_row from public.billing_orders
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
  end if;
  return jsonb_build_object(
    'id', order_row.id, 'status', order_row.status,
    'amount_minor', order_row.amount_minor, 'currency', order_row.currency,
    'expires_at', order_row.expires_at
  );
end;
$$;

create or replace function public.create_billing_order(
  p_price_code text,
  p_idempotency_key text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_billing_order((select auth.uid()), p_price_code, p_idempotency_key);
$$;

create or replace function private.redeem_code_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code_row public.access_codes;
  owner_key text;
begin
  if p_user_id is null or p_user_id is distinct from (select auth.uid()) then
    return 'login_required';
  end if;
  owner_key := 'u_' || p_user_id::text;

  select * into code_row
    from public.access_codes
   where code = btrim(p_code)
   for update;
  if not found then return 'not_found'; end if;
  if code_row.revoked then return 'revoked'; end if;
  if code_row.redeemed_by is not null and code_row.redeemed_by <> owner_key then
    return 'used';
  end if;

  update public.access_codes set
    redeemed_by = owner_key,
    redeemed_at = coalesce(redeemed_at, now()),
    expires_at = coalesce(
      expires_at,
      case when days is null then null else now() + make_interval(days => greatest(days, 1)) end
    )
  where code = code_row.code
  returning * into code_row;
  return 'ok';
end;
$$;

insert into public.user_entitlements(
  user_id, entitlement_key, source_type, source_id, status,
  starts_at, ends_at, revoked_at, metadata
)
select
  auth_user.id, 'premium', 'premium_code', code.code,
  case when code.revoked then 'revoked' else 'active' end,
  case
    when code.expires_at is not null
      and code.expires_at <= coalesce(code.redeemed_at, code.created_at, now())
      then code.expires_at - interval '1 second'
    else coalesce(code.redeemed_at, code.created_at, now())
  end,
  code.expires_at,
  case when code.revoked then now() else null end,
  jsonb_build_object('kind', coalesce(code.kind, 'trial'))
from public.access_codes code
join auth.users auth_user
  on code.redeemed_by = 'u_' || auth_user.id::text
where code.redeemed_by is not null
on conflict on constraint user_entitlements_source_key do update set
  user_id = excluded.user_id,
  status = excluded.status,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  revoked_at = excluded.revoked_at,
  metadata = excluded.metadata,
  updated_at = now();

create or replace function private.sync_access_code_entitlement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  entitlement_user_id uuid;
  entitlement_start timestamptz;
begin
  if tg_op = 'DELETE' then
    update public.user_entitlements set
      status = 'revoked',
      revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
    where source_type = 'premium_code'
      and source_id = old.code
      and entitlement_key = 'premium';
    return old;
  end if;

  if new.redeemed_by is null
     or new.redeemed_by !~ '^u_[0-9a-fA-F-]{36}$' then
    update public.user_entitlements set
      status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where source_type = 'premium_code'
      and source_id = new.code
      and entitlement_key = 'premium';
    return new;
  end if;

  entitlement_user_id := substring(new.redeemed_by from 3)::uuid;
  if not exists (select 1 from auth.users where id = entitlement_user_id) then
    return new;
  end if;
  entitlement_start := coalesce(new.redeemed_at, new.created_at, now());
  if new.expires_at is not null and new.expires_at <= entitlement_start then
    entitlement_start := new.expires_at - interval '1 second';
  end if;

  insert into public.user_entitlements(
    user_id, entitlement_key, source_type, source_id, status,
    starts_at, ends_at, revoked_at, metadata
  ) values (
    entitlement_user_id, 'premium', 'premium_code', new.code,
    case when new.revoked then 'revoked' else 'active' end,
    entitlement_start, new.expires_at,
    case when new.revoked then now() else null end,
    jsonb_build_object('kind', coalesce(new.kind, 'trial'))
  )
  on conflict on constraint user_entitlements_source_key do update set
    user_id = excluded.user_id,
    status = excluded.status,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    revoked_at = excluded.revoked_at,
    metadata = excluded.metadata,
    updated_at = now();
  return new;
end;
$$;
revoke all on function private.sync_access_code_entitlement() from public, anon, authenticated;
drop trigger if exists access_codes_sync_entitlement on public.access_codes;
drop trigger if exists access_codes_sync_entitlement_write on public.access_codes;
drop trigger if exists access_codes_sync_entitlement_delete on public.access_codes;
create trigger access_codes_sync_entitlement_write
  after insert or update of redeemed_by, redeemed_at, revoked, kind, expires_at
  on public.access_codes
  for each row execute function private.sync_access_code_entitlement();
create trigger access_codes_sync_entitlement_delete
  after delete on public.access_codes
  for each row execute function private.sync_access_code_entitlement();

create or replace function public.redeem_code(p_code text, p_device text)
returns text language sql security invoker set search_path = '' as $$
  select private.redeem_code_for_user((select auth.uid()), p_code);
$$;

create or replace function public.premium_status(p_device text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (
      select jsonb_build_object(
        'active', true,
        'kind', coalesce(
          entitlement.metadata->>'kind',
          case when entitlement.source_type in ('payment', 'subscription') then 'sub' else 'trial' end
        ),
        'expires_at', entitlement.ends_at,
        'source', entitlement.source_type
      )
      from public.user_entitlements entitlement
      where entitlement.user_id = (select auth.uid())
        and entitlement.entitlement_key = 'premium'
        and entitlement.status = 'active'
        and entitlement.revoked_at is null
        and entitlement.starts_at <= now()
        and (entitlement.ends_at is null or entitlement.ends_at > now())
      order by
        (
          coalesce(
            entitlement.metadata->>'kind',
            case when entitlement.source_type in ('payment', 'subscription') then 'sub' else 'trial' end
          ) = 'sub'
        ) desc,
        entitlement.ends_at desc nulls first,
        entitlement.created_at desc
      limit 1
    ),
    jsonb_build_object(
      'active', false, 'kind', null, 'expires_at', null, 'source', null
    )
  );
$$;

create or replace function public.is_premium(p_device text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((public.premium_status(p_device)->>'active')::boolean, false);
$$;

create or replace function private.claim_billing_webhook(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload_sha256 text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare event_row private.billing_webhook_events;
begin
  if p_provider is null or p_provider !~ '^[a-z0-9_]{2,32}$'
     or p_event_id is null or char_length(p_event_id) not between 1 and 180
     or p_event_type is null or char_length(p_event_type) not between 1 and 100
     or p_payload_sha256 is null
     or lower(p_payload_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception 'BILLING_WEBHOOK_INVALID';
  end if;

  insert into private.billing_webhook_events(
    provider, event_id, event_type, payload_sha256,
    signature_verified, status, processing_started_at
  ) values (
    p_provider, p_event_id, p_event_type, lower(p_payload_sha256),
    true, 'processing', now()
  )
  on conflict on constraint billing_webhook_events_provider_event_key do nothing
  returning * into event_row;
  if found then
    return true;
  end if;

  select * into event_row
    from private.billing_webhook_events
   where provider = p_provider and event_id = p_event_id
   for update;
  if not found then raise exception 'BILLING_WEBHOOK_CLAIM_FAILED'; end if;

  if event_row.payload_sha256 <> lower(p_payload_sha256)
     or event_row.event_type <> p_event_type then
    raise exception 'BILLING_WEBHOOK_REPLAY_MISMATCH';
  end if;

  if event_row.status = 'processed' then return false; end if;
  if event_row.status = 'processing'
     and event_row.processing_started_at > now() - interval '5 minutes' then
    return false;
  end if;

  update private.billing_webhook_events set
    signature_verified = true,
    status = 'processing',
    attempt_count = attempt_count + 1,
    processing_started_at = now(),
    last_received_at = now(),
    processed_at = null,
    error_code = null
  where id = event_row.id;
  return true;
end;
$$;

create or replace function private.finish_billing_webhook(
  p_provider text,
  p_event_id text,
  p_success boolean,
  p_error_code text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.billing_webhook_events set
    status = case when p_success then 'processed' else 'failed' end,
    processed_at = case when p_success then now() else null end,
    error_code = case when p_success then null else left(coalesce(p_error_code, 'BILLING_WEBHOOK_FAILED'), 100) end
  where provider = p_provider and event_id = p_event_id;
  if not found then raise exception 'BILLING_WEBHOOK_NOT_FOUND'; end if;
  return true;
end;
$$;

create or replace function private.capture_billing_order(
  p_provider text,
  p_event_id text,
  p_order_id uuid,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_approved_at timestamptz default now()
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  event_row private.billing_webhook_events;
  order_row public.billing_orders;
  payment_row public.billing_payments;
  entitlement_end timestamptz;
begin
  if p_provider is null or p_provider !~ '^[a-z0-9_]{2,32}$'
     or p_provider_transaction_id is null
     or char_length(p_provider_transaction_id) not between 1 and 160
     or p_amount_minor is null or p_amount_minor < 0
     or p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$'
     or p_order_id is null then
    raise exception 'BILLING_CAPTURE_INPUT_INVALID';
  end if;
  select * into event_row
    from private.billing_webhook_events
   where provider = p_provider and event_id = p_event_id
     and signature_verified = true
   for update;
  if not found then raise exception 'BILLING_WEBHOOK_UNVERIFIED'; end if;
  if event_row.status <> 'processing' then
    select * into payment_row
      from public.billing_payments payment
     where payment.webhook_event_id = event_row.id;
    if found
       and payment_row.provider_transaction_id = p_provider_transaction_id
       and payment_row.order_id = p_order_id
       and payment_row.amount_minor = p_amount_minor
       and payment_row.currency = upper(p_currency) then
      return jsonb_build_object('status', 'duplicate', 'payment_id', payment_row.id);
    end if;
    raise exception 'BILLING_WEBHOOK_STATE_INVALID';
  end if;

  select * into order_row
    from public.billing_orders
   where id = p_order_id
   for update;
  if not found then raise exception 'BILLING_ORDER_NOT_FOUND'; end if;
  if order_row.user_id is null then raise exception 'BILLING_ORDER_OWNER_MISSING'; end if;

  select payment.* into payment_row
    from public.billing_payments payment
   where payment.provider = p_provider
     and payment.provider_transaction_id = p_provider_transaction_id;
  if found then
    if payment_row.order_id <> order_row.id
       or payment_row.amount_minor <> p_amount_minor
       or payment_row.currency <> upper(p_currency) then
      raise exception 'BILLING_TRANSACTION_CONFLICT';
    end if;
    perform private.finish_billing_webhook(p_provider, p_event_id, true, null);
    return jsonb_build_object('status', 'duplicate', 'payment_id', payment_row.id);
  end if;

  if order_row.status <> 'pending' then raise exception 'BILLING_ORDER_STATE_INVALID'; end if;
  if order_row.expires_at <= now() then
    update public.billing_orders set status = 'expired' where id = order_row.id;
    perform private.finish_billing_webhook(
      p_provider, p_event_id, false, 'BILLING_ORDER_EXPIRED'
    );
    return jsonb_build_object(
      'status', 'expired', 'error', 'BILLING_ORDER_EXPIRED', 'order_id', order_row.id
    );
  end if;
  if order_row.amount_minor <> p_amount_minor then raise exception 'BILLING_AMOUNT_MISMATCH'; end if;
  if order_row.currency <> upper(p_currency) then raise exception 'BILLING_CURRENCY_MISMATCH'; end if;

  insert into public.billing_payments(
    user_id, order_id, webhook_event_id, provider, provider_transaction_id, status,
    amount_minor, currency, approved_at
  ) values (
    order_row.user_id, order_row.id, event_row.id,
    p_provider, p_provider_transaction_id, 'captured',
    p_amount_minor, upper(p_currency), coalesce(p_approved_at, now())
  )
  on conflict on constraint billing_payments_provider_transaction_key do nothing
  returning * into payment_row;
  if not found then
    raise exception 'BILLING_TRANSACTION_CONFLICT';
  end if;

  update public.billing_orders set
    status = 'paid', paid_at = coalesce(p_approved_at, now())
  where id = order_row.id;

  entitlement_end := case
    when order_row.access_days is not null
      then coalesce(p_approved_at, now()) + make_interval(days => order_row.access_days)
    when order_row.interval_unit = 'month'
      then coalesce(p_approved_at, now()) + (order_row.interval_count || ' months')::interval
    when order_row.interval_unit = 'year'
      then coalesce(p_approved_at, now()) + (order_row.interval_count || ' years')::interval
    else null
  end;

  insert into public.user_entitlements(
    user_id, entitlement_key, source_type, source_id, status,
    starts_at, ends_at, metadata
  ) values (
    order_row.user_id, order_row.entitlement_key, 'payment', payment_row.id::text, 'active',
    coalesce(p_approved_at, now()), entitlement_end,
    jsonb_build_object(
      'kind', 'sub', 'provider', p_provider,
      'order_id', order_row.id, 'product_code', order_row.product_code
    )
  )
  on conflict on constraint user_entitlements_source_key do update set
    status = 'active',
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    revoked_at = null,
    metadata = excluded.metadata,
    updated_at = now();

  perform private.finish_billing_webhook(p_provider, p_event_id, true, null);
  return jsonb_build_object(
    'status', 'captured', 'payment_id', payment_row.id,
    'order_id', order_row.id, 'entitlement_key', order_row.entitlement_key,
    'entitlement_ends_at', entitlement_end
  );
end;
$$;

create or replace function public.billing_claim_webhook(
  p_provider text, p_event_id text, p_event_type text, p_payload_sha256 text
)
returns boolean language sql security invoker set search_path = '' as $$
  select private.claim_billing_webhook(p_provider, p_event_id, p_event_type, p_payload_sha256);
$$;

create or replace function public.billing_finish_webhook(
  p_provider text, p_event_id text, p_success boolean, p_error_code text default null
)
returns boolean language sql security invoker set search_path = '' as $$
  select private.finish_billing_webhook(p_provider, p_event_id, p_success, p_error_code);
$$;

create or replace function public.billing_capture_order(
  p_provider text,
  p_event_id text,
  p_order_id uuid,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_approved_at timestamptz default now()
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.capture_billing_order(
    p_provider, p_event_id, p_order_id, p_provider_transaction_id,
    p_amount_minor, p_currency, p_approved_at
  );
$$;

revoke all on function private.create_billing_order(uuid,text,text) from public, anon;
revoke all on function private.redeem_code_for_user(uuid,text) from public, anon;
revoke all on function private.claim_billing_webhook(text,text,text,text) from public, anon, authenticated;
revoke all on function private.finish_billing_webhook(text,text,boolean,text) from public, anon, authenticated;
revoke all on function private.capture_billing_order(text,text,uuid,text,bigint,text,timestamptz) from public, anon, authenticated;
grant execute on function private.create_billing_order(uuid,text,text) to authenticated;
grant execute on function private.redeem_code_for_user(uuid,text) to authenticated;
grant execute on function private.claim_billing_webhook(text,text,text,text) to service_role;
grant execute on function private.finish_billing_webhook(text,text,boolean,text) to service_role;
grant execute on function private.capture_billing_order(text,text,uuid,text,bigint,text,timestamptz) to service_role;

revoke all on function public.create_billing_order(text,text) from public, anon;
revoke all on function public.redeem_code(text,text) from public, anon;
revoke all on function public.premium_status(text) from public, anon;
revoke all on function public.is_premium(text) from public, anon;
revoke all on function public.billing_claim_webhook(text,text,text,text) from public, anon, authenticated;
revoke all on function public.billing_finish_webhook(text,text,boolean,text) from public, anon, authenticated;
revoke all on function public.billing_capture_order(text,text,uuid,text,bigint,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_billing_order(text,text) to authenticated;
grant execute on function public.redeem_code(text,text) to authenticated;
grant execute on function public.premium_status(text) to authenticated;
grant execute on function public.is_premium(text) to authenticated;
grant execute on function public.billing_claim_webhook(text,text,text,text) to service_role;
grant execute on function public.billing_finish_webhook(text,text,boolean,text) to service_role;
grant execute on function public.billing_capture_order(text,text,uuid,text,bigint,text,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
