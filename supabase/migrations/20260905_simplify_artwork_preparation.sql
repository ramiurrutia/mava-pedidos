begin;

update public.order_artwork_preparations
set status = 'pending', updated_at = now()
where status = 'in_preparation';

commit;
