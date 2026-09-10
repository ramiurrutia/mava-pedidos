-- Localidad opcional. Ejecutar después de las migraciones de carpetas y PDF.
-- Conserva las funciones anteriores y sus permisos para clientes existentes.
begin;

alter table public.orders add column if not exists locality text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_locality_length') then
    alter table public.orders add constraint orders_locality_length check (char_length(locality) <= 120);
  end if;
end $$;

create or replace function public.create_order_with_locality(
  requested_prefix text, requested_client_name text, requested_notes text,
  requested_canvases_ordered boolean, requested_locality text
) returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare result public.orders;
begin
  if char_length(trim(requested_locality)) > 120 then raise exception 'LOCALITY_TOO_LONG'; end if;
  select * into result from public.create_order(requested_prefix, requested_client_name, requested_notes, requested_canvases_ordered);
  update public.orders set locality = nullif(trim(requested_locality), '') where id = result.id returning * into result;
  return result;
end;
$$;

create or replace function public.update_order_details_with_locality(
  requested_order_id uuid, requested_client_name text, requested_notes text,
  requested_contact_name text, requested_whatsapp text, requested_locality text
) returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare result public.orders;
begin
  if char_length(trim(requested_locality)) > 120 then raise exception 'LOCALITY_TOO_LONG'; end if;
  select * into result from public.update_order_details(requested_order_id, requested_client_name, requested_notes, requested_contact_name, requested_whatsapp);
  update public.orders set locality = nullif(trim(requested_locality), '') where id = result.id returning * into result;
  return result;
end;
$$;

create or replace function public.begin_pdf_order_import_with_locality(
  requested_hash text, requested_filename text, requested_size_bytes bigint,
  requested_client_name text, requested_folder_id uuid, requested_folder_name text,
  requested_notes text, requested_phone text, requested_total numeric,
  requested_canvases_ordered boolean, requested_images jsonb, requested_locality text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare reservation jsonb; updated_order public.orders;
begin
  if char_length(trim(requested_locality)) > 120 then raise exception 'LOCALITY_TOO_LONG'; end if;
  reservation := public.begin_pdf_order_import(requested_hash, requested_filename, requested_size_bytes,
    requested_client_name, requested_folder_id, requested_folder_name, requested_notes, requested_phone,
    requested_total, requested_canvases_ordered, requested_images);
  -- A retry must never overwrite an existing order's reviewed details.
  if not (reservation->>'reused')::boolean then
    update public.orders set locality = nullif(trim(requested_locality), '')
      where id = (reservation->'order'->>'id')::uuid returning * into updated_order;
    reservation := jsonb_set(reservation, '{order}', to_jsonb(updated_order));
  end if;
  return reservation;
end;
$$;

revoke all on function public.create_order_with_locality(text, text, text, boolean, text) from public;
grant execute on function public.create_order_with_locality(text, text, text, boolean, text) to anon, authenticated;
revoke all on function public.update_order_details_with_locality(uuid, text, text, text, text, text) from public;
grant execute on function public.update_order_details_with_locality(uuid, text, text, text, text, text) to anon, authenticated;
revoke all on function public.begin_pdf_order_import_with_locality(text, text, bigint, text, uuid, text, text, text, numeric, boolean, jsonb, text) from public;
grant execute on function public.begin_pdf_order_import_with_locality(text, text, bigint, text, uuid, text, text, text, numeric, boolean, jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
