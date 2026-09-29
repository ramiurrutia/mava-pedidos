-- Expand PDF batches while retaining the same reservation and retry rules.
begin;

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
  if jsonb_array_length(requested_documents) not between 1 and 10 then raise exception 'INVALID_PDF_DOCUMENTS'; end if;
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

notify pgrst, 'reload schema';
commit;
