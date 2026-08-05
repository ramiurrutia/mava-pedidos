begin;

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

revoke all on function public.update_order_image_description(uuid, text) from public;
grant execute on function public.update_order_image_description(uuid, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
