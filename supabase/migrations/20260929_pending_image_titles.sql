-- Combine pre-upload title editing with the dedicated title column.
-- Run after 20260927_order_image_titles.sql.
begin;

create or replace function public.prepare_order_image_with_details(
  requested_client_id uuid,
  requested_order_id uuid,
  requested_image_id uuid,
  requested_filename text,
  requested_mime_type text,
  requested_size_bytes bigint,
  requested_description text,
  requested_title text
) returns public.order_images
language plpgsql security definer set search_path = ''
as $$
declare prepared public.order_images;
begin
  if length(coalesce(requested_title, '')) > 120 then
    raise exception 'IMAGE_TITLE_TOO_LONG';
  end if;
  select * into prepared from public.prepare_order_image(
    requested_client_id, requested_order_id, requested_image_id, requested_filename,
    requested_mime_type, requested_size_bytes, requested_description
  );
  update public.order_images set title = trim(coalesce(requested_title, ''))
    where id = prepared.id returning * into prepared;
  return prepared;
end;
$$;

revoke all on function public.prepare_order_image_with_details(uuid, uuid, uuid, text, text, bigint, text, text) from public;
grant execute on function public.prepare_order_image_with_details(uuid, uuid, uuid, text, text, bigint, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
