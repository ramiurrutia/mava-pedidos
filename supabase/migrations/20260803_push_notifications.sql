begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique constraint push_subscriptions_endpoint_length_check
    check (length(endpoint) between 1 and 2048),
  expiration_time bigint,
  p256dh text not null constraint push_subscriptions_p256dh_length_check
    check (length(p256dh) between 1 and 512),
  auth text not null constraint push_subscriptions_auth_length_check
    check (length(auth) between 1 and 256),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_notification_events (
  order_id uuid primary key references public.orders(id) on delete cascade,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.push_notification_events (order_id, claimed_at, sent_at)
select id, now(), now()
from public.orders
where source_system is not null
on conflict (order_id) do nothing;

create index if not exists push_notification_events_pending_idx
on public.push_notification_events(created_at)
where sent_at is null;

create or replace function public.claim_pending_order_notifications(requested_order_ids uuid[])
returns table (order_id uuid)
language sql
security definer
set search_path = ''
as $$
  update public.push_notification_events as event
  set claimed_at = now()
  where event.order_id = any(requested_order_ids)
    and event.sent_at is null
    and (event.claimed_at is null or event.claimed_at < now() - interval '5 minutes')
  returning event.order_id;
$$;

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_events enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_notification_events from anon, authenticated;
revoke all on function public.claim_pending_order_notifications(uuid[]) from public;
grant execute on function public.claim_pending_order_notifications(uuid[]) to service_role;

commit;

notify pgrst, 'reload schema';
