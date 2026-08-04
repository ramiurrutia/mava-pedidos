begin;

alter table public.orders
  add column if not exists has_local_edits boolean not null default false,
  add column if not exists deleted_at timestamptz;

create or replace function public.preserve_locally_edited_order_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.has_local_edits
    and coalesce(current_setting('mava.allow_order_detail_edit', true), 'false') <> 'true' then
    new.client_id := old.client_id;
    new.client_name := old.client_name;
    new.notes := old.notes;
    new.contact_name := old.contact_name;
    new.whatsapp := old.whatsapp;
    new.has_local_edits := true;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_preserve_locally_edited_details on public.orders;
create trigger orders_preserve_locally_edited_details
before update on public.orders
for each row execute function public.preserve_locally_edited_order_details();

create or replace function public.reject_images_for_deleted_orders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders
    where id = new.order_id and deleted_at is not null
  ) then
    raise exception 'ORDER_DELETED';
  end if;
  return new;
end;
$$;

drop trigger if exists order_images_reject_deleted_order on public.order_images;
create trigger order_images_reject_deleted_order
before insert on public.order_images
for each row execute function public.reject_images_for_deleted_orders();

create or replace function public.update_order_details(
  requested_order_id uuid,
  requested_client_name text,
  requested_notes text default '',
  requested_contact_name text default null,
  requested_whatsapp text default null
) returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_client_id uuid;
  stored_client_name text;
  updated_order public.orders;
begin
  if nullif(trim(requested_client_name), '') is null
    or length(trim(requested_client_name)) > 80 then
    raise exception 'INVALID_CLIENT_NAME';
  end if;
  if length(coalesce(requested_notes, '')) > 5000 then
    raise exception 'NOTES_TOO_LONG';
  end if;
  if length(coalesce(requested_contact_name, '')) > 120 then
    raise exception 'CONTACT_NAME_TOO_LONG';
  end if;
  if length(coalesce(requested_whatsapp, '')) > 40 then
    raise exception 'WHATSAPP_TOO_LONG';
  end if;

  insert into public.client_folders (name)
  values (trim(requested_client_name))
  on conflict (normalized_name) do nothing
  returning id, name into requested_client_id, stored_client_name;

  if requested_client_id is null then
    select id, name into requested_client_id, stored_client_name
    from public.client_folders
    where normalized_name = lower(trim(requested_client_name));
  end if;

  perform set_config('mava.allow_order_detail_edit', 'true', true);

  update public.orders
  set
    client_id = requested_client_id,
    client_name = stored_client_name,
    notes = coalesce(requested_notes, ''),
    contact_name = nullif(trim(requested_contact_name), ''),
    whatsapp = nullif(trim(requested_whatsapp), ''),
    has_local_edits = true
  where id = requested_order_id
    and deleted_at is null
  returning * into updated_order;

  if updated_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  return updated_order;
end;
$$;

create or replace function public.soft_delete_order(requested_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
  set deleted_at = now()
  where id = requested_order_id
    and deleted_at is null;
  return found;
end;
$$;

revoke all on function public.update_order_details(uuid, text, text, text, text) from public;
revoke all on function public.soft_delete_order(uuid) from public;
revoke all on function public.preserve_locally_edited_order_details() from public;
revoke all on function public.reject_images_for_deleted_orders() from public;

grant execute on function public.update_order_details(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.soft_delete_order(uuid) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
