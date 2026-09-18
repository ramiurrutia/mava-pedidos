-- Remove individual saved images without deleting the order or its original document.
begin;

alter table public.order_images add column if not exists deleted_at timestamptz;

-- Also hides archived images from older clients and nested order_images queries.
drop policy if exists "internal app reads images" on public.order_images;
create policy "internal app reads images" on public.order_images
for select to anon, authenticated using (deleted_at is null);

create or replace function public.soft_delete_order_image(requested_order_id uuid, requested_image_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare target public.order_images;
begin
  -- Match the import finalizer's lock order to avoid deleting an image mid-import.
  perform 1 from public.order_pdf_imports where order_id = requested_order_id for update;
  perform 1 from public.orders where id = requested_order_id and deleted_at is null for update;
  if not found then return false; end if;
  select * into target from public.order_images
    where id = requested_image_id and order_id = requested_order_id for update;
  if not found then return false; end if;
  if target.deleted_at is not null then return true; end if;
  if target.upload_status <> 'ready' then return false; end if;
  if exists (
    select 1 from public.order_pdf_imports p
    where p.order_id = requested_order_id and p.completed_at is null
      and exists (select 1 from jsonb_array_elements(p.manifest) m where m->>'id' = requested_image_id::text)
  ) then raise exception 'DOCUMENT_IMPORT_INCOMPLETE'; end if;
  update public.order_images set deleted_at = now() where id = requested_image_id;
  delete from public.order_artwork_preparations
    where order_id = requested_order_id and artwork_key = 'image:' || requested_image_id::text;
  return true;
end;
$$;

revoke all on function public.soft_delete_order_image(uuid, uuid) from public;
grant execute on function public.soft_delete_order_image(uuid, uuid) to anon, authenticated;

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
      and order_images.deleted_at is null
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

create or replace function public.update_order_image_description(
  requested_image_id uuid,
  requested_description text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_description text;
begin
  if length(coalesce(requested_description, '')) > 1000 then
    raise exception 'IMAGE_DESCRIPTION_TOO_LONG';
  end if;

  update public.order_images
  set description = trim(coalesce(requested_description, ''))
  where id = requested_image_id
    and upload_status = 'ready'
    and deleted_at is null
    and exists (
      select 1
      from public.orders
      where orders.id = order_images.order_id
        and orders.deleted_at is null
    )
  returning description into saved_description;

  if not found then
    raise exception 'IMAGE_NOT_FOUND';
  end if;

  return saved_description;
end;
$$;

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

  perform 1 from public.orders where id = requested_order_id and deleted_at is null for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if trim(requested_artwork_key) like 'image:%' and not exists (
    select 1 from public.order_images where order_id = requested_order_id
      and 'image:' || id::text = trim(requested_artwork_key)
      and deleted_at is null and upload_status = 'ready'
  ) then raise exception 'IMAGE_NOT_FOUND'; end if;

  insert into public.order_artwork_preparations (order_id, artwork_key, status)
  values (requested_order_id, trim(requested_artwork_key), requested_status)
  on conflict (order_id, artwork_key) do update
  set status = excluded.status, updated_at = now();
end;
$$;

notify pgrst, 'reload schema';
commit;
