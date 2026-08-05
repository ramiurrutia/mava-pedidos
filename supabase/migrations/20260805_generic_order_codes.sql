begin;

create or replace function public.assign_generic_order_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_digits text;
begin
  code_digits := new.code_number::text;
  new.code := 'PEDIDO-' || lpad(code_digits, greatest(6, length(code_digits)), '0');
  return new;
end;
$$;

drop trigger if exists orders_assign_generic_code on public.orders;
create trigger orders_assign_generic_code
before insert on public.orders
for each row execute function public.assign_generic_order_code();

revoke all on function public.assign_generic_order_code() from public;

commit;
