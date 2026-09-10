-- PDF import: the order, chosen folder and prepared image rows are created atomically.
-- This keeps the existing internal-app access model (no login changes).
create table if not exists public.order_pdf_imports (
  order_id uuid primary key references public.orders(id) on delete restrict,
  file_hash text not null unique check (file_hash ~ '^[a-f0-9]{64}$'),
  filename text not null check (length(filename) between 1 and 255),
  size_bytes bigint not null check (size_bytes between 5 and 20971520),
  image_spec jsonb not null check (jsonb_typeof(image_spec) = 'array'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'array'),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.order_pdf_imports enable row level security;
drop policy if exists "internal app reads PDF imports" on public.order_pdf_imports;
create policy "internal app reads PDF imports" on public.order_pdf_imports
for select to anon, authenticated using (true);
grant select on public.order_pdf_imports to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-documents', 'order-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "internal app reads order PDFs" on storage.objects;
create policy "internal app reads order PDFs" on storage.objects
for select to anon, authenticated using (bucket_id = 'order-documents');
drop policy if exists "prepared order PDF uploads" on storage.objects;
create policy "prepared order PDF uploads" on storage.objects
for insert to anon, authenticated with check (
  bucket_id = 'order-documents' and exists (
    select 1 from public.order_pdf_imports p
    join public.orders o on o.id = p.order_id
    where name = p.order_id::text || '/' || p.file_hash || '.pdf'
      and o.deleted_at is null and p.completed_at is null
  )
);

create or replace function public.begin_pdf_order_import(
  requested_hash text,
  requested_filename text,
  requested_size_bytes bigint,
  requested_client_name text,
  requested_folder_id uuid,
  requested_folder_name text,
  requested_notes text,
  requested_phone text,
  requested_total numeric,
  requested_canvases_ordered boolean,
  requested_images jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  existing public.order_pdf_imports;
  target_order public.orders;
  folder_name text;
  item jsonb;
  prepared public.order_images;
  image_manifest jsonb := '[]'::jsonb;
  image_signature jsonb;
begin
  if requested_hash is null or requested_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_PDF_HASH'; end if;
  if requested_filename is null or length(requested_filename) not between 1 and 255
    or requested_size_bytes is null or requested_size_bytes not between 5 and 20971520 then
    raise exception 'INVALID_PDF_FILE';
  end if;
  if nullif(trim(requested_client_name), '') is null or length(trim(requested_client_name)) > 80 then
    raise exception 'INVALID_CLIENT_NAME';
  end if;
  if jsonb_typeof(requested_images) is distinct from 'array'
    or jsonb_array_length(requested_images) not between 1 and 200 then raise exception 'INVALID_PDF_IMAGES'; end if;
  if length(coalesce(requested_notes, '')) > 30000 or length(coalesce(requested_phone, '')) > 80
    or requested_total is null or requested_total < 0 or requested_total > 999999999999.99 then
    raise exception 'INVALID_PDF_DETAILS';
  end if;

  select jsonb_agg(jsonb_build_object('filename', x.value->>'filename', 'description', x.value->>'description') order by x.position)
    into image_signature from jsonb_array_elements(requested_images) with ordinality x(value, position);
  perform pg_advisory_xact_lock(hashtext('pdf-import:' || requested_hash));
  select * into existing from public.order_pdf_imports where file_hash = requested_hash;
  if found then
    select * into target_order from public.orders where id = existing.order_id;
    if target_order.deleted_at is not null then raise exception 'PDF_ORDER_DELETED'; end if;
    if existing.completed_at is null and existing.image_spec is distinct from image_signature then
      raise exception 'PDF_IMPORT_DIFFERENT_DRAFT';
    end if;
    return jsonb_build_object('order', to_jsonb(target_order), 'manifest', existing.manifest,
      'completed', existing.completed_at is not null, 'reused', true);
  end if;

  if requested_folder_id is not null then
    select name into folder_name from public.client_folders where id = requested_folder_id;
    if not found then raise exception 'FOLDER_NOT_FOUND'; end if;
  else
    folder_name := trim(requested_folder_name);
    if nullif(folder_name, '') is null or length(folder_name) > 80 then raise exception 'INVALID_FOLDER_NAME'; end if;
  end if;
  select * into target_order from public.create_order('CLASH', folder_name, requested_notes, requested_canvases_ordered);
  update public.orders set client_name = trim(requested_client_name),
    contact_name = trim(requested_client_name), whatsapp = nullif(trim(requested_phone), ''),
    source_system = 'PDF', source_order_id = requested_hash, source_status = 'pdf_pending',
    organization_folder_id = target_order.client_id, total = requested_total
  where id = target_order.id returning * into target_order;

  for item in select value from jsonb_array_elements(requested_images) loop
    if nullif(item->>'filename', '') is null or item->>'mimeType' is distinct from 'image/jpeg'
      or (item->>'size') is null then raise exception 'INVALID_PDF_IMAGE'; end if;
    select * into prepared from public.prepare_order_image(
      target_order.client_id, target_order.id, gen_random_uuid(),
      item->>'filename', 'image/jpeg', (item->>'size')::bigint, item->>'description'
    );
    image_manifest := image_manifest || jsonb_build_array(to_jsonb(prepared));
  end loop;
  insert into public.order_pdf_imports (order_id, file_hash, filename, size_bytes, image_spec, manifest)
  values (target_order.id, requested_hash, requested_filename, requested_size_bytes, image_signature, image_manifest);
  return jsonb_build_object('order', to_jsonb(target_order), 'manifest', image_manifest, 'completed', false, 'reused', false);
end;
$$;

create or replace function public.complete_pdf_order_import(requested_order_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  target public.order_pdf_imports;
  target_order public.orders;
begin
  select * into target from public.order_pdf_imports where order_id = requested_order_id for update;
  if not found then raise exception 'PDF_IMPORT_NOT_FOUND'; end if;
  select * into target_order from public.orders where id = requested_order_id for update;
  if target_order.deleted_at is not null then raise exception 'PDF_ORDER_DELETED'; end if;
  if target.completed_at is not null then return true; end if;
  if target_order.status not in ('pending', 'in_production') then raise exception 'PDF_ORDER_NOT_ACTIVE'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'order-documents'
    and name = target.order_id::text || '/' || target.file_hash || '.pdf') then
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
  where order_id = target.order_id and id in (
    select (m->>'id')::uuid from jsonb_array_elements(target.manifest) m
  );
  update public.order_pdf_imports set completed_at = now() where order_id = target.order_id;
  update public.orders set source_status = 'pdf_complete' where id = target.order_id;
  return true;
end;
$$;

revoke all on function public.begin_pdf_order_import(text, text, bigint, text, uuid, text, text, text, numeric, boolean, jsonb) from public;
grant execute on function public.begin_pdf_order_import(text, text, bigint, text, uuid, text, text, text, numeric, boolean, jsonb) to anon, authenticated;
revoke all on function public.complete_pdf_order_import(uuid) from public;
grant execute on function public.complete_pdf_order_import(uuid) to anon, authenticated;

