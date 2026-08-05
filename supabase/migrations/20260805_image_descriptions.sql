begin;

alter table public.order_images
  add column if not exists description text not null default '';

alter table public.order_images
  drop constraint if exists order_images_description_length_check,
  add constraint order_images_description_length_check check (length(description) <= 1000);

drop function if exists public.prepare_order_image(uuid, uuid, uuid, text, text, bigint);

create or replace function public.prepare_order_image(
  requested_client_id uuid,
  requested_order_id uuid,
  requested_image_id uuid,
  requested_filename text,
  requested_mime_type text,
  requested_size_bytes bigint,
  requested_description text default ''
) returns public.order_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  safe_filename text;
  prepared_image public.order_images;
begin
  if nullif(trim(requested_filename), '') is null or length(trim(requested_filename)) > 255 then
    raise exception 'INVALID_IMAGE_FILENAME';
  end if;

  if requested_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception 'UNSUPPORTED_IMAGE_TYPE';
  end if;

  if requested_size_bytes not between 1 and 6291456 then
    raise exception 'IMAGE_SIZE_OUT_OF_RANGE';
  end if;

  if length(coalesce(requested_description, '')) > 1000 then
    raise exception 'IMAGE_DESCRIPTION_TOO_LONG';
  end if;

  if requested_order_id is not null then
    select id into target_order_id
    from public.orders
    where id = requested_order_id
      and client_id = requested_client_id
      and status in ('pending', 'in_production')
      and deleted_at is null
    for update;
  else
    select id into target_order_id
    from public.orders
    where client_id = requested_client_id
      and status in ('pending', 'in_production')
      and deleted_at is null
    order by created_at desc, id desc
    limit 1
    for update;
  end if;

  if target_order_id is null then
    raise exception 'NO_PENDING_ORDER';
  end if;

  safe_filename := regexp_replace(
    coalesce(nullif(trim(requested_filename), ''), 'imagen'),
    '[^a-zA-Z0-9._-]+',
    '-',
    'g'
  );

  insert into public.order_images (
    id,
    order_id,
    storage_key,
    original_filename,
    description,
    mime_type,
    size_bytes,
    uploaded_by
  )
  values (
    requested_image_id,
    target_order_id,
    'orders/' || target_order_id || '/' || requested_image_id || '/' || safe_filename,
    requested_filename,
    trim(coalesce(requested_description, '')),
    requested_mime_type,
    requested_size_bytes,
    null
  )
  returning * into prepared_image;

  return prepared_image;
end;
$$;

revoke all on function public.prepare_order_image(uuid, uuid, uuid, text, text, bigint, text) from public;
grant execute on function public.prepare_order_image(uuid, uuid, uuid, text, text, bigint, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
