begin;

-- La carpeta elegida es independiente del cliente y del origen sincronizado.
alter table public.orders
  add column if not exists organization_folder_id uuid
  references public.client_folders(id) on delete restrict;

create index if not exists orders_organization_folder_idx
  on public.orders(organization_folder_id);

create or replace function public.move_order_to_folder(
  requested_order_id uuid,
  requested_folder_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
begin
  select * into target_order from public.orders
  where id = requested_order_id and deleted_at is null
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if requested_folder_id is null then
    if target_order.source_system is distinct from 'MAVA STOCK' then
      raise exception 'ORDER_NOT_FROM_STOCK';
    end if;
  elsif not exists (select 1 from public.client_folders where id = requested_folder_id) then
    raise exception 'FOLDER_NOT_FOUND';
  end if;

  update public.orders
  set organization_folder_id = requested_folder_id
  where id = requested_order_id;
  return true;
end;
$$;

revoke all on function public.move_order_to_folder(uuid, uuid) from public;
grant execute on function public.move_order_to_folder(uuid, uuid) to anon, authenticated;

commit;
notify pgrst, 'reload schema';

