-- Items such as mirrors can belong to an order without uploading an image.
begin;

create table if not exists public.order_manual_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  quantity integer not null default 1 check (quantity between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);
create index if not exists order_manual_items_order_idx on public.order_manual_items(order_id) where deleted_at is null;
alter table public.order_manual_items enable row level security;
drop policy if exists "internal app reads manual items" on public.order_manual_items;
create policy "internal app reads manual items" on public.order_manual_items for select to anon, authenticated
  using (deleted_at is null and exists (select 1 from public.orders where id = order_id and deleted_at is null));
revoke all on public.order_manual_items from anon, authenticated;
grant select on public.order_manual_items to anon, authenticated;

create or replace function public.mutate_order_manual_item(
  requested_order_id uuid, requested_item_id uuid, requested_action text,
  requested_title text default '', requested_description text default '',
  requested_quantity integer default 1, requested_status text default 'pending'
) returns public.order_manual_items
language plpgsql security definer set search_path = '' as $$
declare
  target public.orders;
  result public.order_manual_items;
begin
  if requested_action is null or requested_action not in ('create', 'update', 'delete', 'status') then
    raise exception 'INVALID_ACTION';
  end if;
  select * into target from public.orders where id = requested_order_id and deleted_at is null for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if requested_action in ('create', 'update') and target.status <> 'pending' then raise exception 'ORDER_ARCHIVED'; end if;
  if requested_action in ('create', 'update') then
    if nullif(trim(requested_title), '') is null or length(trim(requested_title)) > 120
      or length(coalesce(requested_description, '')) > 1000
      or requested_quantity is null or requested_quantity not between 1 and 200 then raise exception 'INVALID_ITEM_DETAILS'; end if;
  end if;
  if requested_action = 'create' then
    insert into public.order_manual_items(id, order_id, title, description, quantity)
      values(requested_item_id, requested_order_id, trim(requested_title), trim(coalesce(requested_description, '')), requested_quantity)
      returning * into result;
  else
    select * into result from public.order_manual_items
      where id = requested_item_id and order_id = requested_order_id and deleted_at is null for update;
    if not found then raise exception 'ITEM_NOT_FOUND'; end if;
    if requested_action = 'update' then
      update public.order_manual_items set title = trim(requested_title), description = trim(coalesce(requested_description, '')), quantity = requested_quantity
        where id = result.id returning * into result;
    elsif requested_action = 'delete' then
      update public.order_manual_items set deleted_at = clock_timestamp() where id = result.id returning * into result;
    else
      if requested_status is null or requested_status not in ('pending', 'ready') then raise exception 'INVALID_ITEM_STATUS'; end if;
      update public.order_manual_items set status = requested_status where id = result.id returning * into result;
    end if;
  end if;
  return result;
end;
$$;
revoke all on function public.mutate_order_manual_item(uuid, uuid, text, text, text, integer, text) from public;
grant execute on function public.mutate_order_manual_item(uuid, uuid, text, text, text, integer, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
