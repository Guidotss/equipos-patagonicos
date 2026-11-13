-- Revierte la aprobación cuando no hay movimientos que lo impidan.
create or replace function public.revertir_aprobacion(p_id uuid) returns void language plpgsql security definer
set search_path = '' as $$
declare v_cotizacion public.cotizaciones %rowtype;
begin perform private.exigir_usuario_activo();
select * into v_cotizacion
from public.cotizaciones
where id = p_id;
perform private.lock_financial_client(v_cotizacion.cliente_id);
perform private.lock_financial_rows(v_cotizacion.cliente_id);
perform private.require_budget_without_finances(p_id);
-- Bloquea la cotización antes de validarla y de buscar documentos: un documento que se está vinculando o
-- restaurando a la vez (que la tiene bloqueada para compartir) termina primero y acá se lo ve; uno que llega
-- después espera y ve la cotización ya revertida.
select * into v_cotizacion
from public.cotizaciones
where id = p_id for
update;
-- Primero lo que no se arregla anulando documentos (así un presupuesto directo recibe su mensaje).
if v_cotizacion.origen = 'directa' then raise exception 'Un presupuesto directo no se revierte: anulalo desde el presupuesto' using errcode = 'P0001';
end if;
if v_cotizacion.id is null
or v_cotizacion.estado <> 'aprobada' then raise exception 'Solo se puede revertir la aprobación de una cotización aprobada' using errcode = 'P0001';
end if;
if exists (
  select 1
  from public.documento_presupuestos dp
    join public.documentos d on d.id = dp.documento_id
    and d.deleted_at is null
  where dp.cotizacion_id = p_id
) then raise exception 'El presupuesto tiene documentos cargados; anulalos antes de revertir la aprobación' using errcode = 'P0001';
end if;
update public.cotizaciones c
set estado = case
    when c.origen = 'importada'
    or exists (
      select 1
      from public.cotizacion_envios e
      where e.cotizacion_id = c.id
    ) then 'enviada'
    else 'borrador'
  end,
  fecha_aprobacion = null,
  pdf_aprobado_path = null,
  presupuesto_estado = null,
  presupuesto_motivo = ''
where c.id = p_id;
end;
$$;