create or replace function private.vincular_remitos(p_factura_id uuid, p_cliente_id uuid, p_remitos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Bloquea los remitos en juego (en orden, para no trabarse con otra factura) antes de mirar a quién apuntan.
  perform 1 from public.documentos
  where factura_id = p_factura_id or id = any (coalesce(p_remitos, '{}'))
  order by id
  for update;

  update public.documentos set factura_id = null
  where factura_id = p_factura_id and not (id = any (coalesce(p_remitos, '{}')));

  if coalesce(cardinality(p_remitos), 0) = 0 then
    return;
  end if;

  if exists (
    select 1 from unnest(p_remitos) as r(id)
    where not exists (
      select 1 from public.documentos d
      where d.id = r.id and d.tipo = 'remito' and d.cliente_id = p_cliente_id and d.deleted_at is null
    )
  ) then
    raise exception 'Algún remito no es de este cliente o está anulado' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.documentos d
    join public.documentos f on f.id = d.factura_id
    where d.id = any (p_remitos) and f.id <> p_factura_id and f.deleted_at is null
  ) then
    raise exception 'Algún remito ya está cubierto por otra factura' using errcode = 'P0001';
  end if;

  update public.documentos set factura_id = p_factura_id where id = any (p_remitos);
end;
$$;
