begin;

create or replace function public.enqueue_new_order_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.push_notification_events (order_id)
  values (new.id)
  on conflict (order_id) do nothing;
  return new;
end;
$$;

drop trigger if exists orders_enqueue_new_order_notification on public.orders;
create trigger orders_enqueue_new_order_notification
after insert on public.orders
for each row execute function public.enqueue_new_order_notification();

revoke all on function public.enqueue_new_order_notification() from public;

commit;

notify pgrst, 'reload schema';
