begin;

create or replace function public.assign_generic_order_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_code text;
  generated_code text;
  code_suffix integer := 1;
begin
  base_code := 'PEDIDO-' || to_char(
    timezone('America/Argentina/Buenos_Aires', coalesce(new.created_at, now())),
    'DDMMYYYY-HH24MI'
  );
  perform pg_advisory_xact_lock(hashtext('public-order-code:' || base_code));

  generated_code := base_code;
  while exists (select 1 from public.orders where code = generated_code) loop
    code_suffix := code_suffix + 1;
    generated_code := base_code || '-' || lpad(
      code_suffix::text,
      greatest(2, length(code_suffix::text)),
      '0'
    );
  end loop;

  new.code := generated_code;
  return new;
end;
$$;

revoke all on function public.assign_generic_order_code() from public;

commit;
