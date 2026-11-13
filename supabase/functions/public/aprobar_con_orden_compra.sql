-- Aprueba una cotización y registra su orden de compra.
create or replace function public.aprobar_con_orden_compra(
    p_id uuid,
    p_updated_at timestamptz,
    p_pdf_path text,
    p_documento jsonb,
    p_archivos jsonb
  ) returns uuid language plpgsql security definer
set search_path = '' as $$
declare v_cliente uuid;
v_doc uuid;
v_fecha date;
begin perform private.exigir_usuario_activo();
select cliente_id into v_cliente
from public.cotizaciones
where id = p_id;
if v_cliente is not null then perform private.lock_financial_client(v_cliente);
perform private.lock_financial_rows(v_cliente);
end if;
select cliente_id into v_cliente
from public.cotizaciones
where id = p_id for
update;
if not found then raise exception 'La cotización no existe' using errcode = 'P0001';
end if;
if p_documento->>'tipo' is distinct
from 'orden_compra' then raise exception 'Elegí una orden de compra' using errcode = 'P0001';
end if;
v_fecha := coalesce(
  (p_documento->>'fecha')::date,
  private.hoy_argentina()
);
perform public.aprobar_cotizacion(p_id, p_updated_at, nullif(p_pdf_path, ''), v_fecha);
v_doc := public.registrar_documento(
  p_documento || jsonb_build_object('cliente_id', v_cliente),
  array [p_id],
  p_archivos,
  array []::uuid [],
  '[]'::jsonb
);
return v_doc;
end;
$$;