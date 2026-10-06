-- Allow PDF attachments on existing orders without changing their origin or metadata.
-- Run after 20260930_order_pdf_management.sql.
begin;

alter table public.order_import_documents drop constraint if exists order_import_documents_order_id_fkey;
alter table public.order_import_documents add constraint order_import_documents_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete restrict;

create or replace function public.begin_pdf_documents_import(
  requested_order_id uuid, requested_documents jsonb,
  requested_client_name text, requested_folder_id uuid, requested_folder_name text,
  requested_notes text, requested_phone text, requested_total numeric,
  requested_canvases_ordered boolean, requested_images jsonb, requested_locality text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  doc jsonb; item jsonb; doc_row public.order_import_documents; target public.orders;
  prepared public.order_images; reservation jsonb; image_manifest jsonb:='[]';
  doc_manifest jsonb; spec jsonb; target_id uuid; image_index integer:=0;
  reused boolean:=false; all_complete boolean:=true; existing_count integer;
begin
  if jsonb_typeof(requested_documents) is distinct from 'array' or jsonb_typeof(requested_images) is distinct from 'array' then
    raise exception 'INVALID_PDF_DOCUMENTS'; end if;
  if jsonb_array_length(requested_documents) not between 1 and 10 or jsonb_array_length(requested_images) not between 1 and 200 then
    raise exception 'INVALID_PDF_DOCUMENTS'; end if;
  if (select count(distinct value->>'hash') from jsonb_array_elements(requested_documents))<>jsonb_array_length(requested_documents) then
    raise exception 'DUPLICATE_PDF_DOCUMENT'; end if;
  for doc in select value from jsonb_array_elements(requested_documents) order by value->>'hash' loop
    if doc->>'hash' is null or doc->>'hash' !~ '^[a-f0-9]{64}$' or doc->>'filename' is null
      or length(doc->>'filename') not between 1 and 255 or lower(doc->>'filename') not like '%.pdf'
      or doc->>'size' is null or (doc->>'size')::bigint not between 5 and 20971520 then raise exception 'INVALID_PDF_FILE'; end if;
    if not exists(select 1 from jsonb_array_elements(requested_images) x where x->>'documentHash'=doc->>'hash') then
      raise exception 'INVALID_PDF_IMAGES'; end if;
    perform pg_advisory_xact_lock(hashtext('pdf-import:'||(doc->>'hash')));
  end loop;
  if exists(select 1 from jsonb_array_elements(requested_images) x where not exists(
    select 1 from jsonb_array_elements(requested_documents) d where d->>'hash'=x->>'documentHash'
  )) then raise exception 'INVALID_PDF_IMAGE_SOURCE'; end if;

  if requested_order_id is null then
    reservation:=public.begin_pdf_order_batch_import(requested_documents,requested_client_name,requested_folder_id,
      requested_folder_name,requested_notes,requested_phone,requested_total,requested_canvases_ordered,requested_images,requested_locality);
    target_id:=(reservation->'order'->>'id')::uuid;
    if exists(select 1 from public.order_import_documents where order_id=target_id and deleted_at is not null) then
      raise exception 'PDF_DOCUMENT_DELETED'; end if;
    -- A completed historical import must be mapped from its originals, not an edited retry.
    if (reservation->>'completed')::boolean then return reservation; end if;
    for item in select value from jsonb_array_elements(requested_images) loop
      update public.order_images set source_document_hash=item->>'documentHash'
      where id=(reservation->'manifest'->image_index->>'id')::uuid and order_id=target_id;
      image_index:=image_index+1;
    end loop;
    for doc in select value from jsonb_array_elements(requested_documents) loop
      select coalesce(jsonb_agg(m.value order by m.position),'[]') into doc_manifest
      from jsonb_array_elements(reservation->'manifest') with ordinality m(value,position)
      join public.order_images i on i.id=(m.value->>'id')::uuid where i.source_document_hash=doc->>'hash';
      update public.order_import_documents set mapping_complete=true,manifest=doc_manifest
      where order_id=target_id and file_hash=doc->>'hash';
    end loop;
    return reservation;
  end if;

  perform 1 from public.order_pdf_imports where order_id=requested_order_id for update;
  select * into target from public.orders where id=requested_order_id and deleted_at is null for update;
  if not found then raise exception 'PDF_ORDER_DELETED'; end if;
  if target.status not in ('pending','in_production') then raise exception 'PDF_ORDER_NOT_ACTIVE'; end if;
  if exists(select 1 from public.order_pdf_imports where order_id=requested_order_id and completed_at is null) then
    raise exception 'PDF_INITIAL_IMPORT_INCOMPLETE'; end if;
  if exists(select 1 from public.order_import_documents d where d.file_hash in
    (select value->>'hash' from jsonb_array_elements(requested_documents)) and d.order_id<>requested_order_id)
    or exists(select 1 from public.order_pdf_imports p where p.file_hash in
    (select value->>'hash' from jsonb_array_elements(requested_documents)) and p.order_id<>requested_order_id) then
    raise exception 'PDF_ALREADY_IN_ANOTHER_IMPORT'; end if;
  if exists(select 1 from public.order_import_documents where order_id=requested_order_id and deleted_at is not null
    and file_hash in(select value->>'hash' from jsonb_array_elements(requested_documents))) then raise exception 'PDF_DOCUMENT_DELETED'; end if;
  select count(*) into existing_count from public.order_import_documents where order_id=requested_order_id and deleted_at is null;
  if existing_count+(select count(*) from jsonb_array_elements(requested_documents) x where not exists(
    select 1 from public.order_import_documents d where d.file_hash=x->>'hash'))>10 then raise exception 'PDF_DOCUMENT_LIMIT'; end if;

  for doc in select value from jsonb_array_elements(requested_documents) order by value->>'hash' loop
    select jsonb_agg(jsonb_build_object('filename',x.value->>'filename','description',x.value->>'description') order by x.position)
      into spec from jsonb_array_elements(requested_images) with ordinality x(value,position) where x.value->>'documentHash'=doc->>'hash';
    select * into doc_row from public.order_import_documents where file_hash=doc->>'hash';
    if found then
      reused:=true;
      -- Initial PDFs are handled through the original-import retry flow.
      if doc_row.is_initial then raise exception 'PDF_ALREADY_IN_ANOTHER_IMPORT'; end if;
      if doc_row.image_spec is distinct from spec then raise exception 'PDF_IMPORT_DIFFERENT_DRAFT'; end if;
      if doc_row.completed_at is null then all_complete:=false; end if;
    else
      all_complete:=false;
      insert into public.order_import_documents(order_id,file_hash,filename,size_bytes,is_initial,mapping_complete,image_spec,manifest)
      values(requested_order_id,doc->>'hash',doc->>'filename',(doc->>'size')::bigint,false,true,spec,'[]') returning * into doc_row;
      doc_manifest:='[]';
      for item in select value from jsonb_array_elements(requested_images) where value->>'documentHash'=doc->>'hash' loop
        if item->>'mimeType' is distinct from 'image/jpeg' then raise exception 'INVALID_PDF_IMAGE'; end if;
        select * into prepared from public.prepare_order_image(target.client_id,target.id,gen_random_uuid(),
          item->>'filename','image/jpeg',(item->>'size')::bigint,item->>'description');
        update public.order_images set source_document_hash=doc->>'hash' where id=prepared.id;
        doc_manifest:=doc_manifest||jsonb_build_array(to_jsonb(prepared));
      end loop;
      update public.order_import_documents set manifest=doc_manifest where file_hash=doc->>'hash' returning * into doc_row;
    end if;
  end loop;
  if (select count(*) from public.order_images where order_id=requested_order_id and deleted_at is null and upload_status<>'failed')>200 then
    raise exception 'INVALID_PDF_IMAGES'; end if;
  -- Return the manifest in the caller's exact image order, regardless of selection order.
  select jsonb_agg(m.value order by x.position) into image_manifest
  from jsonb_array_elements(requested_images) with ordinality x(value,position)
  join public.order_import_documents d on d.file_hash=x.value->>'documentHash' and d.order_id=requested_order_id
  cross join lateral jsonb_array_elements(d.manifest) m(value)
  where m.value->>'original_filename'=x.value->>'filename';
  if jsonb_array_length(image_manifest) is distinct from jsonb_array_length(requested_images) then raise exception 'INVALID_PDF_IMAGES'; end if;
  return jsonb_build_object('order',to_jsonb(target),'manifest',image_manifest,'completed',all_complete,'reused',reused);
end;
$$;

create or replace function public.complete_pdf_documents_import(requested_order_id uuid,requested_hashes text[])
returns boolean language plpgsql security definer set search_path='' as $$
declare target public.orders; doc public.order_import_documents;
begin
  perform 1 from public.order_pdf_imports where order_id=requested_order_id for update;
  select * into target from public.orders where id=requested_order_id and deleted_at is null for update;
  if not found then raise exception 'PDF_ORDER_DELETED'; end if;
  if coalesce(cardinality(requested_hashes),0) not between 1 and 10 then raise exception 'INVALID_PDF_DOCUMENTS'; end if;
  if (select count(*) from public.order_import_documents where order_id=requested_order_id and deleted_at is null and file_hash=any(requested_hashes))<>cardinality(requested_hashes) then
    raise exception 'PDF_DOCUMENT_NOT_FOUND'; end if;
  for doc in select * from public.order_import_documents where order_id=requested_order_id and file_hash=any(requested_hashes) loop
    if doc.completed_at is not null then continue; end if;
    if target.status not in ('pending','in_production') then raise exception 'PDF_ORDER_NOT_ACTIVE'; end if;
    if not exists(select 1 from storage.objects where bucket_id='order-documents' and name=requested_order_id::text||'/'||doc.file_hash||'.pdf') then
      raise exception 'PDF_DOCUMENT_NOT_UPLOADED'; end if;
    if not doc.mapping_complete or doc.manifest is null then raise exception 'PDF_SOURCE_NOT_MAPPED'; end if;
    if exists(select 1 from jsonb_array_elements(doc.manifest) m where not exists(
      select 1 from public.order_images i join storage.objects s on s.bucket_id='order-images' and s.name=i.storage_key
      where i.id=(m->>'id')::uuid and i.order_id=requested_order_id and i.source_document_hash=doc.file_hash and i.deleted_at is null
    )) then raise exception 'PDF_IMAGES_NOT_UPLOADED'; end if;
    update public.order_images set upload_status='ready' where order_id=requested_order_id and source_document_hash=doc.file_hash and deleted_at is null;
    update public.order_import_documents set completed_at=now() where file_hash=doc.file_hash;
  end loop;
  if target.source_system = 'PDF' and not exists(select 1 from public.order_import_documents where order_id=requested_order_id and is_initial and completed_at is null) then
    update public.order_pdf_imports set completed_at=coalesce(completed_at,now()) where order_id=requested_order_id;
    update public.orders set source_status='pdf_complete' where id=requested_order_id;
  end if;
  return true;
end;
$$;

create or replace function public.list_order_pdf_documents(requested_order_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('filename',d.filename,'file_hash',d.file_hash,'completed_at',
    case when d.is_initial then coalesce(d.completed_at,p.completed_at) else d.completed_at end,
    'is_initial',d.is_initial,'mapping_complete',d.mapping_complete,'image_count',
    (select count(*) from public.order_images i where i.order_id=d.order_id and i.source_document_hash=d.file_hash and i.deleted_at is null)) order by d.file_hash),'[]')
  from public.order_import_documents d left join public.order_pdf_imports p on p.order_id=d.order_id
  join public.orders o on o.id=d.order_id where d.order_id=requested_order_id and d.deleted_at is null and o.deleted_at is null;
$$;

create or replace function public.soft_delete_order_pdf_document(requested_order_id uuid,requested_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc public.order_import_documents; removed jsonb;
begin
  perform 1 from public.order_pdf_imports where order_id=requested_order_id for update;
  perform 1 from public.orders where id=requested_order_id and deleted_at is null for update;
  if not found then raise exception 'PDF_ORDER_DELETED'; end if;
  if exists(select 1 from public.order_pdf_imports where order_id=requested_order_id and completed_at is null) then
    raise exception 'PDF_INITIAL_IMPORT_INCOMPLETE'; end if;
  select * into doc from public.order_import_documents where order_id=requested_order_id and file_hash=requested_hash;
  if not found then raise exception 'PDF_DOCUMENT_NOT_FOUND'; end if;
  if not doc.mapping_complete then raise exception 'PDF_SOURCE_NOT_MAPPED'; end if;
  select coalesce(jsonb_agg(id),'[]') into removed from public.order_images where order_id=requested_order_id and source_document_hash=requested_hash;
  update public.order_images set deleted_at=coalesce(deleted_at,now()) where order_id=requested_order_id and source_document_hash=requested_hash;
  delete from public.order_artwork_preparations where order_id=requested_order_id and artwork_key in
    (select 'image:'||id::text from public.order_images where order_id=requested_order_id and source_document_hash=requested_hash);
  update public.order_import_documents set deleted_at=coalesce(deleted_at,now()) where file_hash=requested_hash;
  return removed;
end;
$$;

notify pgrst,'reload schema';
commit;
