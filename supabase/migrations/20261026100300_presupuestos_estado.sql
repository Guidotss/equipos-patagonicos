-- supabase/migrations/20261026100300_presupuestos_estado.sql
-- Estado del presupuesto (en curso / finalizado / anulado) y revertir la aprobación solo sin documentos activos.

create or replace function public.cambiar_estado_presupuesto(p_id uuid, p_estado text, p_motivo text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  if p_estado is null or p_estado not in ('en_curso', 'finalizado', 'anulado') then
    raise exception 'Estado de presupuesto inválido' using errcode = 'P0001';
  end if;
  if p_estado = 'anulado' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indicá el motivo de la anulación' using errcode = 'P0001';
  end if;

  -- El motivo es de la anulación: al finalizar o volver a en curso queda vacío.
  update public.cotizaciones
  set presupuesto_estado = p_estado,
      presupuesto_motivo = case when p_estado = 'anulado' then btrim(p_motivo) else '' end
  where id = p_id and estado = 'aprobada';
  if not found then
    raise exception 'El presupuesto no existe' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.cambiar_estado_presupuesto(uuid, text, text) to authenticated;

-- Vuelve a enviada si el cliente tiene un documento (una cargada, o una de la app con envíos), o a borrador.
-- Un presupuesto directo no se revierte (no hubo cotización): se anula desde el presupuesto.
-- No se revierte mientras el presupuesto tenga documentos vinculados sin anular.
create or replace function public.revertir_aprobacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cotizacion public.cotizaciones%rowtype;
begin
  perform private.exigir_usuario_activo();
  -- Bloquea la cotización antes de validarla y de buscar documentos: un documento que se está vinculando o
  -- restaurando a la vez (que la tiene bloqueada para compartir) termina primero y acá se lo ve; uno que llega
  -- después espera y ve la cotización ya revertida.
  select * into v_cotizacion from public.cotizaciones where id = p_id for update;
  -- Primero lo que no se arregla anulando documentos (así un presupuesto directo recibe su mensaje).
  if v_cotizacion.origen = 'directa' then
    raise exception 'Un presupuesto directo no se revierte: anulalo desde el presupuesto' using errcode = 'P0001';
  end if;
  if v_cotizacion.id is null or v_cotizacion.estado <> 'aprobada' then
    raise exception 'Solo se puede revertir la aprobación de una cotización aprobada' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.documento_presupuestos dp
    join public.documentos d on d.id = dp.documento_id and d.deleted_at is null
    where dp.cotizacion_id = p_id
  ) then
    raise exception 'El presupuesto tiene documentos cargados; anulalos antes de revertir la aprobación' using errcode = 'P0001';
  end if;
  update public.cotizaciones c set
    estado = case when c.origen = 'importada'
                    or exists (select 1 from public.cotizacion_envios e where e.cotizacion_id = c.id)
                  then 'enviada' else 'borrador' end,
    fecha_aprobacion = null,
    pdf_aprobado_path = null,
    presupuesto_estado = null,
    presupuesto_motivo = ''
  where c.id = p_id;
end;
$$;
