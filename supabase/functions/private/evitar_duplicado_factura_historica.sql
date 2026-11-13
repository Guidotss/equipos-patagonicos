create or replace function private.evitar_duplicado_factura_historica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_numero text := ltrim(regexp_replace(lower(new.numero), '[^a-z0-9]', '', 'g'), '0');
begin
  if new.tipo <> 'factura' or new.tipo_comprobante is distinct from 'FA' then return new; end if;
  if tg_op = 'UPDATE' and (new.tipo, new.tipo_comprobante, v_numero) is not distinct from
     (old.tipo, old.tipo_comprobante, ltrim(regexp_replace(lower(old.numero), '[^a-z0-9]', '', 'g'), '0')) then
    -- Las ediciones de notas ya tienen la fila bloqueada: no tomar otro bloqueo en orden inverso.
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('factura-historica:FA:' || v_numero, 0));
  if exists (
    select 1 from public.facturas_historicas h
    join public.documentos d on d.id = h.factura_id
    where d.numero_normalizado = v_numero and d.id <> new.id
  ) then
    raise exception 'Ya existe una factura histórica FA con ese número, incluso si está anulada'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
