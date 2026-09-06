begin;

do $$
begin
  create type public.artwork_preparation_status as enum ('pending', 'in_preparation', 'ready');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.order_artwork_preparations (
  order_id uuid not null references public.orders(id) on delete cascade,
  artwork_key text not null constraint order_artwork_preparations_key_check
    check (length(artwork_key) between 3 and 200 and artwork_key ~ '^(image|stock):'),
  status public.artwork_preparation_status not null default 'pending',
  updated_at timestamptz not null default now(),
  primary key (order_id, artwork_key)
);

alter table public.order_artwork_preparations enable row level security;

drop policy if exists "internal app reads artwork preparation"
on public.order_artwork_preparations;
create policy "internal app reads artwork preparation"
on public.order_artwork_preparations for select to anon, authenticated using (true);

create or replace function public.set_artwork_preparation_status(
  requested_order_id uuid,
  requested_artwork_key text,
  requested_status public.artwork_preparation_status
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(requested_artwork_key), '') is null
    or length(trim(requested_artwork_key)) > 200
    or trim(requested_artwork_key) !~ '^(image|stock):' then
    raise exception 'INVALID_ARTWORK_KEY';
  end if;

  if not exists (
    select 1 from public.orders
    where id = requested_order_id and deleted_at is null
  ) then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  insert into public.order_artwork_preparations (order_id, artwork_key, status)
  values (requested_order_id, trim(requested_artwork_key), requested_status)
  on conflict (order_id, artwork_key) do update
  set status = excluded.status, updated_at = now();
end;
$$;

revoke all on public.order_artwork_preparations from anon, authenticated;
grant select on public.order_artwork_preparations to anon, authenticated;

revoke all on function public.set_artwork_preparation_status(uuid, text, public.artwork_preparation_status) from public;
grant execute on function public.set_artwork_preparation_status(uuid, text, public.artwork_preparation_status) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
