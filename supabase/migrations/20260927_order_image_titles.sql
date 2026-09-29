-- Keep the original filename intact; titles are editable presentation metadata.
begin;

alter table public.order_images
  add column if not exists title text not null default ''
  constraint order_images_title_length_check check (length(title) <= 120);

create or replace function public.update_order_image_details(
  requested_image_id uuid,
  requested_title text,
  requested_description text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_details jsonb;
begin
  if length(coalesce(requested_title, '')) > 120 then
    raise exception 'IMAGE_TITLE_TOO_LONG';
  end if;
  if length(coalesce(requested_description, '')) > 1000 then
    raise exception 'IMAGE_DESCRIPTION_TOO_LONG';
  end if;

  update public.order_images
  set title = trim(coalesce(requested_title, '')),
      description = trim(coalesce(requested_description, ''))
  where id = requested_image_id
    and upload_status = 'ready'
    and deleted_at is null
    and exists (
      select 1 from public.orders
      where orders.id = order_images.order_id
        and orders.deleted_at is null
    )
  returning jsonb_build_object('title', title, 'description', description) into saved_details;

  if not found then
    raise exception 'IMAGE_NOT_FOUND';
  end if;
  return saved_details;
end;
$$;

revoke all on function public.update_order_image_details(uuid, text, text) from public;
grant execute on function public.update_order_image_details(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
