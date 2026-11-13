create or replace function private.validar_presupuestos(p_cliente_id uuid, p_presupuestos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_presupuestos is null or cardinality(p_presupuestos) = 0 then
    raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
  end if;
  if exists(select 1 from unnest(p_presupuestos) p(id) where not exists
    (select 1 from public.cotizaciones c where c.id = p.id and c.cliente_id = p_cliente_id)) then
    raise exception 'Los documentos solo se cargan en presupuestos aprobados, no anulados, del mismo cliente' using errcode = 'P0001';
  end if;
  -- Bloquea los presupuestos (en orden) antes de mirar su estado y los deja así hasta confirmar el documento:
  -- si a la vez se revierte la aprobación o se anula el presupuesto, el vínculo espera y ve el estado nuevo;
  -- un revertir que llega después espera y ve el documento.
  perform 1 from public.cotizaciones
  where id = any (p_presupuestos)
  order by id
  for share;

  if exists (
    select 1 from unnest(p_presupuestos) as p(id)
    where not exists (
      select 1 from public.cotizaciones c
      where c.id = p.id and c.estado = 'aprobada' and c.cliente_id = p_cliente_id
        and c.presupuesto_estado <> 'anulado'
    )
  ) then
    raise exception 'Los documentos solo se cargan en presupuestos aprobados, no anulados, del mismo cliente' using errcode = 'P0001';
  end if;
end;
$$;
