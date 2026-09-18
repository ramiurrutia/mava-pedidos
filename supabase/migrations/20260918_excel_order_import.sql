-- Extend the existing atomic, resumable document import to Excel.
-- Run after 20260910_order_locality.sql. Existing PDF clients remain compatible.
begin;

alter table public.order_pdf_imports
  add column if not exists document_type text not null default 'pdf'
  check (document_type in ('pdf', 'xlsx'));

update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'order-documents';

drop policy if exists "prepared order PDF uploads" on storage.objects;
create policy "prepared order PDF uploads" on storage.objects
for insert to anon, authenticated with check (
  bucket_id = 'order-documents' and exists (
    select 1 from public.order_pdf_imports p
    join public.orders o on o.id = p.order_id
    where name = p.order_id::text || '/' || p.file_hash || '.' || p.document_type
      and o.deleted_at is null and p.completed_at is null
  )
);

create or replace function public.begin_excel_order_import_with_locality(
  requested_hash text, requested_filename text, requested_size_bytes bigint,
  requested_client_name text, requested_folder_id uuid, requested_folder_name text,
  requested_notes text, requested_phone text, requested_total numeric,
  requested_canvases_ordered boolean, requested_images jsonb, requested_locality text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare reservation jsonb; updated_order public.orders;
begin
  if requested_filename is null or lower(requested_filename) not like '%.xlsx' then
    raise exception 'INVALID_EXCEL_FILE';
  end if;
  -- The shared reservation keeps the same hash lock, image manifest and retry rules.
  reservation := public.begin_pdf_order_import_with_locality(requested_hash, requested_filename, requested_size_bytes,
    requested_client_name, requested_folder_id, requested_folder_name, requested_notes, requested_phone,
    requested_total, requested_canvases_ordered, requested_images, requested_locality);
  if not (reservation->>'reused')::boolean then
    update public.order_pdf_imports set document_type = 'xlsx'
      where order_id = (reservation->'order'->>'id')::uuid;
    update public.orders set source_system = 'EXCEL', source_status = 'excel_pending'
      where id = (reservation->'order'->>'id')::uuid returning * into updated_order;
    reservation := jsonb_set(reservation, '{order}', to_jsonb(updated_order));
  elsif not exists (
    select 1 from public.order_pdf_imports
    where order_id = (reservation->'order'->>'id')::uuid and document_type = 'xlsx'
  ) then
    raise exception 'INVALID_EXCEL_FILE';
  end if;
  return reservation;
end;
$$;

create or replace function public.complete_pdf_order_import(requested_order_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare target public.order_pdf_imports; target_order public.orders;
begin
  select * into target from public.order_pdf_imports where order_id = requested_order_id for update;
  if not found then raise exception 'PDF_IMPORT_NOT_FOUND'; end if;
  select * into target_order from public.orders where id = requested_order_id for update;
  if target_order.deleted_at is not null then raise exception 'PDF_ORDER_DELETED'; end if;
  if target.completed_at is not null then return true; end if;
  if target_order.status not in ('pending', 'in_production') then raise exception 'PDF_ORDER_NOT_ACTIVE'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'order-documents'
    and name = target.order_id::text || '/' || target.file_hash || '.' || target.document_type) then
    raise exception 'PDF_DOCUMENT_NOT_UPLOADED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(target.manifest) m
    where not exists (
      select 1 from public.order_images i join storage.objects s
        on s.bucket_id = 'order-images' and s.name = i.storage_key
      where i.id = (m->>'id')::uuid and i.order_id = target.order_id
        and i.storage_key = m->>'storage_key'
    )
  ) then raise exception 'PDF_IMAGES_NOT_UPLOADED'; end if;
  update public.order_images set upload_status = 'ready'
  where order_id = target.order_id and id in (select (m->>'id')::uuid from jsonb_array_elements(target.manifest) m);
  update public.order_pdf_imports set completed_at = now() where order_id = target.order_id;
  update public.orders set source_status = case when target.document_type = 'xlsx' then 'excel_complete' else 'pdf_complete' end
    where id = target.order_id;
  return true;
end;
$$;

revoke all on function public.begin_excel_order_import_with_locality(text, text, bigint, text, uuid, text, text, text, numeric, boolean, jsonb, text) from public;
grant execute on function public.begin_excel_order_import_with_locality(text, text, bigint, text, uuid, text, text, text, numeric, boolean, jsonb, text) to anon, authenticated;
revoke all on function public.complete_pdf_order_import(uuid) from public;
grant execute on function public.complete_pdf_order_import(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
