begin;

alter table public.orders
  add column if not exists canvases_ordered boolean not null default false;

comment on column public.orders.canvases_ordered is
  'Indica si ya se solicitaron las telas necesarias para preparar el pedido.';

commit;

notify pgrst, 'reload schema';
