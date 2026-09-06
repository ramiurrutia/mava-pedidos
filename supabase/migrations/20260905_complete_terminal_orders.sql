begin;

create or replace function public.complete_terminal_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is null and new.status in ('finished', 'delivered') then
    if not new.canvases_ordered then
      update public.orders
      set canvases_ordered = true
      where id = new.id;
    end if;

    insert into public.order_artwork_preparations (order_id, artwork_key, status)
    select new.id, 'image:' || order_images.id::text, 'ready'
    from public.order_images
    where order_images.order_id = new.id
      and order_images.upload_status = 'ready'
    on conflict (order_id, artwork_key) do update
    set status = 'ready', updated_at = now();

    insert into public.order_artwork_preparations (order_id, artwork_key, status)
    select
      new.id,
      'stock:' || (artwork.item ->> 'id') || ':' || (artwork.position - 1)::text,
      'ready'
    from jsonb_array_elements(coalesce(new.items, '[]'::jsonb))
      with ordinality as artwork(item, position)
    where nullif(artwork.item ->> 'id', '') is not null
      and length('stock:' || (artwork.item ->> 'id') || ':' || (artwork.position - 1)::text) <= 200
    on conflict (order_id, artwork_key) do update
    set status = 'ready', updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists orders_complete_terminal_insert on public.orders;
create trigger orders_complete_terminal_insert
after insert on public.orders
for each row execute function public.complete_terminal_order();

drop trigger if exists orders_complete_terminal_status on public.orders;
create trigger orders_complete_terminal_status
after update of status on public.orders
for each row execute function public.complete_terminal_order();

update public.orders
set canvases_ordered = true
where deleted_at is null
  and status in ('finished', 'delivered')
  and not canvases_ordered;

insert into public.order_artwork_preparations (order_id, artwork_key, status)
select orders.id, 'image:' || order_images.id::text, 'ready'
from public.orders
join public.order_images on order_images.order_id = orders.id
where orders.deleted_at is null
  and orders.status in ('finished', 'delivered')
  and order_images.upload_status = 'ready'
on conflict (order_id, artwork_key) do update
set status = 'ready', updated_at = now();

insert into public.order_artwork_preparations (order_id, artwork_key, status)
select
  orders.id,
  'stock:' || (artwork.item ->> 'id') || ':' || (artwork.position - 1)::text,
  'ready'
from public.orders
cross join lateral jsonb_array_elements(coalesce(orders.items, '[]'::jsonb))
  with ordinality as artwork(item, position)
where orders.deleted_at is null
  and orders.status in ('finished', 'delivered')
  and nullif(artwork.item ->> 'id', '') is not null
  and length('stock:' || (artwork.item ->> 'id') || ':' || (artwork.position - 1)::text) <= 200
on conflict (order_id, artwork_key) do update
set status = 'ready', updated_at = now();

revoke all on function public.complete_terminal_order() from public;

commit;

notify pgrst, 'reload schema';
