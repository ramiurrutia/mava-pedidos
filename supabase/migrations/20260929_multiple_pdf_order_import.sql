-- Up to three PDF originals in one atomic, resumable import.
-- Run after 20260918_order_image_deletion.sql.
begin;

create table if not exists public.order_import_documents (
  file_hash text primary key check (file_hash ~ '^[a-f0-9]{64}$'),
  order_id uuid not null references public.order_pdf_imports(order_id) on delete restrict,
  filename text not null check (length(filename) between 1 and 255),
  size_bytes bigint not null check (size_bytes between 5 and 20971520)
);
create index if not exists order_import_documents_order_id_idx on public.order_import_documents(order_id);
alter table public.order_import_documents enable row level security;
revoke all on public.order_import_documents from anon, authenticated;
grant select on public.order_import_documents to anon, authenticated;
drop policy if exists "internal app reads import documents" on public.order_import_documents;
create policy "internal app reads import documents" on public.order_import_documents
for select to anon, authenticated using (true);

-- Preserve the filenames and storage paths of existing single-PDF orders.
insert into public.order_import_documents (order_id, file_hash, filename, size_bytes)
select order_id, file_hash, filename, size_bytes from public.order_pdf_imports where document_type = 'pdf'
  and not exists (select 1 from public.order_import_documents d where d.order_id = order_pdf_imports.order_id)
on conflict (file_hash) do nothing;

-- Older clients must not create a separate order for a PDF in a batch.
create or replace function public.prevent_duplicate_import_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.order_import_documents where file_hash = new.file_hash and order_id <> new.order_id) then
    raise exception 'PDF_ALREADY_IN_ANOTHER_IMPORT';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_duplicate_import_document on public.order_pdf_imports;
create trigger prevent_duplicate_import_document before insert on public.order_pdf_imports
for each row execute function public.prevent_duplicate_import_document();
revoke all on function public.prevent_duplicate_import_document() from public;

create or replace function public.begin_pdf_order_batch_import(
  requested_documents jsonb,
  requested_client_name text, requested_folder_id uuid, requested_folder_name text,
  requested_notes text, requested_phone text, requested_total numeric,
  requested_canvases_ordered boolean, requested_images jsonb, requested_locality text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  documents jsonb;
  document jsonb;
  batch_hash text;
  reservation jsonb;
  target_id uuid;
begin
  if jsonb_typeof(requested_documents) is distinct from 'array' then raise exception 'INVALID_PDF_DOCUMENTS'; end if;
  if jsonb_array_length(requested_documents) not between 1 and 3 then raise exception 'INVALID_PDF_DOCUMENTS'; end if;
  for document in select value from jsonb_array_elements(requested_documents) loop
    if document->>'hash' is null or document->>'hash' !~ '^[a-f0-9]{64}$'
      or document->>'filename' is null or length(document->>'filename') not between 1 and 255
      or lower(document->>'filename') not like '%.pdf'
      or document->>'size' is null or (document->>'size')::bigint not between 5 and 20971520 then
      raise exception 'INVALID_PDF_FILE';
    end if;
  end loop;
  if (select count(distinct value->>'hash') from jsonb_array_elements(requested_documents)) <> jsonb_array_length(requested_documents) then
    raise exception 'DUPLICATE_PDF_DOCUMENT';
  end if;
  select jsonb_agg(value order by value->>'hash') into documents from jsonb_array_elements(requested_documents);
  batch_hash := case when jsonb_array_length(documents) = 1 then documents->0->>'hash'
    else encode(sha256(convert_to('pdf-batch:' || (
      select string_agg(value->>'hash', '|' order by value->>'hash') from jsonb_array_elements(documents)
    ), 'UTF8')), 'hex') end;

  -- Consistent lock order also serializes overlapping batches and legacy imports.
  for document in select value from jsonb_array_elements(documents) loop
    perform pg_advisory_xact_lock(hashtext('pdf-import:' || (document->>'hash')));
  end loop;
  if exists (
    select 1 from public.order_import_documents d join public.order_pdf_imports p on p.order_id = d.order_id
    where d.file_hash in (select value->>'hash' from jsonb_array_elements(documents)) and p.file_hash <> batch_hash
  ) or exists (
    select 1 from public.order_pdf_imports p
    where p.file_hash in (select value->>'hash' from jsonb_array_elements(documents)) and p.file_hash <> batch_hash
  ) then raise exception 'PDF_ALREADY_IN_ANOTHER_IMPORT'; end if;

  reservation := public.begin_pdf_order_import_with_locality(batch_hash, documents->0->>'filename',
    (documents->0->>'size')::bigint, requested_client_name, requested_folder_id, requested_folder_name,
    requested_notes, requested_phone, requested_total, requested_canvases_ordered, requested_images, requested_locality);
  target_id := (reservation->'order'->>'id')::uuid;
  if exists (select 1 from public.order_pdf_imports where order_id = target_id and document_type <> 'pdf') then
    raise exception 'INVALID_PDF_FILE';
  end if;
  if not exists (select 1 from public.order_import_documents where order_id = target_id) then
    insert into public.order_import_documents(order_id, file_hash, filename, size_bytes)
    select target_id, value->>'hash', value->>'filename', (value->>'size')::bigint
    from jsonb_array_elements(documents);
  end if;
  return reservation;
end;
$$;
revoke all on function public.begin_pdf_order_batch_import(jsonb, text, uuid, text, text, text, numeric, boolean, jsonb, text) from public;
grant execute on function public.begin_pdf_order_batch_import(jsonb, text, uuid, text, text, text, numeric, boolean, jsonb, text) to anon, authenticated;

drop policy if exists "prepared order PDF uploads" on storage.objects;
create policy "prepared order PDF uploads" on storage.objects
for insert to anon, authenticated with check (
  bucket_id = 'order-documents' and (
    exists (
      select 1 from public.order_import_documents d
      join public.order_pdf_imports p on p.order_id = d.order_id join public.orders o on o.id = p.order_id
      where name = d.order_id::text || '/' || d.file_hash || '.pdf'
        and o.deleted_at is null and p.completed_at is null
    ) or exists (
      select 1 from public.order_pdf_imports p join public.orders o on o.id = p.order_id
      where name = p.order_id::text || '/' || p.file_hash || '.' || p.document_type
        and o.deleted_at is null and p.completed_at is null
        and not exists (select 1 from public.order_import_documents d where d.order_id = p.order_id)
    )
  )
);

create or replace function public.complete_pdf_order_import(requested_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.order_pdf_imports; target_order public.orders;
begin
  select * into target from public.order_pdf_imports where order_id = requested_order_id for update;
  if not found then raise exception 'PDF_IMPORT_NOT_FOUND'; end if;
  select * into target_order from public.orders where id = requested_order_id for update;
  if target_order.deleted_at is not null then raise exception 'PDF_ORDER_DELETED'; end if;
  if target.completed_at is not null then return true; end if;
  if target_order.status not in ('pending', 'in_production') then raise exception 'PDF_ORDER_NOT_ACTIVE'; end if;
  if exists (select 1 from public.order_import_documents where order_id = target.order_id) then
    if exists (
      select 1 from public.order_import_documents d where d.order_id = target.order_id
      and not exists (select 1 from storage.objects s where s.bucket_id = 'order-documents'
        and s.name = d.order_id::text || '/' || d.file_hash || '.pdf')
    ) then raise exception 'PDF_DOCUMENT_NOT_UPLOADED'; end if;
  elsif not exists (select 1 from storage.objects where bucket_id = 'order-documents'
    and name = target.order_id::text || '/' || target.file_hash || '.' || target.document_type) then
    raise exception 'PDF_DOCUMENT_NOT_UPLOADED';
  end if;
  if exists (
    select 1 from jsonb_array_elements(target.manifest) m
    where not exists (
      select 1 from public.order_images i join storage.objects s
        on s.bucket_id = 'order-images' and s.name = i.storage_key
      where i.id = (m->>'id')::uuid and i.order_id = target.order_id
        and i.storage_key = m->>'storage_key' and i.deleted_at is null
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
revoke all on function public.complete_pdf_order_import(uuid) from public;
grant execute on function public.complete_pdf_order_import(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
