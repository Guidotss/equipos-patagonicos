create or replace function private.reemplazar_presupuestos(p_documento_id uuid, p_presupuestos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.documento_presupuestos where documento_id = p_documento_id;
  insert into public.documento_presupuestos (documento_id, cotizacion_id)
  select distinct p_documento_id, p.id from unnest(p_presupuestos) as p(id);
end;
$$;
