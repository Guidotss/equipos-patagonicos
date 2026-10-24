-- supabase/migrations/20261025100200_cotizaciones_estados.sql
-- Transiciones: borrador/enviada → enviada (con snapshot), → aprobada (congelada) o → rechazada;
-- rechazada → borrador; aprobada → enviada/borrador (revertir).
--
-- Enviar y aprobar bloquean la fila (FOR UPDATE) antes de validar. Como guardar_cotizacion actualiza la
-- cabecera antes de reemplazar los ítems, el bloqueo espera a que termine un guardado en curso y las
-- validaciones ven los ítems que quedaron. p_updated_at (obligatorio) es el updated_at de la fila con la
-- que se generó el PDF: si la cotización cambió desde entonces, el PDF ya no refleja lo guardado y no se
-- registra. Se compara al milisegundo para que pasarlo por un Date de JS (que pierde los microsegundos)
-- no lo invalide.

create or replace function private.exigir_precios(p_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cotizacion_items where cotizacion_id = p_id) then
    raise exception 'La cotización no tiene ítems' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cotizacion_items where cotizacion_id = p_id and precio_unitario is null) then
    raise exception 'Hay ítems sin precio' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.exigir_ruta_pdf(p_id uuid, p_ruta text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_prefijo text := 'cotizaciones/' || p_id::text || '/';
begin
  if p_ruta is null or left(p_ruta, length(v_prefijo)) <> v_prefijo then
    raise exception 'Ruta de PDF inválida' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.exigir_version(p_actual timestamptz, p_leida timestamptz)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_leida is null then
    raise exception 'Falta la versión de la cotización' using errcode = 'P0001';
  end if;
  if date_trunc('milliseconds', p_leida, 'UTC') <> date_trunc('milliseconds', p_actual, 'UTC') then
    raise exception 'La cotización cambió mientras se generaba el PDF; volvé a intentarlo' using errcode = 'P0001';
  end if;
end;
$$;

-- Solo se envían las cotizaciones armadas en la app: lo que recibió el cliente de una cargada es su PDF
-- original, y un envío con un PDF generado haría que se apruebe con un documento que no es el último enviado.
create or replace function public.marcar_enviada(p_id uuid, p_pdf_path text, p_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cotizaciones%rowtype;
begin
  perform private.exigir_usuario_activo();

  select * into c from public.cotizaciones where id = p_id for update;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0001';
  end if;
  if c.estado not in ('borrador', 'enviada') then
    raise exception 'Solo se puede enviar una cotización en borrador o ya enviada' using errcode = 'P0001';
  end if;
  if c.origen <> 'app' then
    raise exception 'Una cotización cargada no se envía desde la app: su documento es el PDF original' using errcode = 'P0001';
  end if;
  perform private.exigir_version(c.updated_at, p_updated_at);
  perform private.exigir_ruta_pdf(p_id, p_pdf_path);
  perform private.exigir_precios(p_id);

  update public.cotizaciones set estado = 'enviada' where id = p_id;
  insert into public.cotizacion_envios (cotizacion_id, pdf_path) values (p_id, p_pdf_path);
end;
$$;

-- Una cotización cargada (importada) se aprueba con su PDF original, que es lo que recibió el cliente
-- (marcar_enviada no le registra envíos): sin exigir precios y sin PDF generado (pdf_aprobado_path queda
-- null). p_updated_at es el updated_at de la fila que se vio al decidir aprobar.
create or replace function public.aprobar_cotizacion(
  p_id uuid,
  p_updated_at timestamptz,
  p_pdf_path text default null,
  p_fecha date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cotizaciones%rowtype;
  v_fecha date := coalesce(p_fecha, private.hoy_argentina());
begin
  perform private.exigir_usuario_activo();

  select * into c from public.cotizaciones where id = p_id for update;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0001';
  end if;
  if c.estado not in ('borrador', 'enviada') then
    raise exception 'Solo se puede aprobar una cotización en borrador o enviada' using errcode = 'P0001';
  end if;
  perform private.exigir_version(c.updated_at, p_updated_at);

  if v_fecha < c.fecha then
    raise exception 'La fecha de aprobación no puede ser anterior a la cotización' using errcode = 'P0001';
  end if;

  if c.origen = 'importada' then
    if p_pdf_path is not null then
      raise exception 'Una cotización cargada se aprueba con su PDF original' using errcode = 'P0001';
    end if;
  else
    perform private.exigir_ruta_pdf(p_id, p_pdf_path);
    perform private.exigir_precios(p_id);
  end if;

  update public.cotizaciones set
    estado = 'aprobada',
    fecha_aprobacion = v_fecha,
    pdf_aprobado_path = p_pdf_path,
    presupuesto_estado = 'en_curso'
  where id = p_id;
end;
$$;

create or replace function public.rechazar_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.cotizaciones set estado = 'rechazada'
  where id = p_id and estado in ('borrador', 'enviada');
  if not found then
    raise exception 'Solo se puede rechazar una cotización en borrador o enviada' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.reabrir_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.cotizaciones set estado = 'borrador'
  where id = p_id and estado = 'rechazada';
  if not found then
    raise exception 'Solo se puede reabrir una cotización rechazada' using errcode = 'P0001';
  end if;
end;
$$;

-- El plan 4 agrega la condición "sin documentos vinculados".
create or replace function public.revertir_aprobacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.cotizaciones c set
    estado = case when exists (select 1 from public.cotizacion_envios e where e.cotizacion_id = c.id)
                  then 'enviada' else 'borrador' end,
    fecha_aprobacion = null,
    pdf_aprobado_path = null,
    presupuesto_estado = null,
    presupuesto_motivo = ''
  where c.id = p_id and c.estado = 'aprobada' and c.origen = 'app';
  if not found then
    raise exception 'Solo se puede revertir la aprobación de una cotización aprobada desde la app' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.marcar_enviada(uuid, text, timestamptz) to authenticated;
grant execute on function public.aprobar_cotizacion(uuid, timestamptz, text, date) to authenticated;
grant execute on function public.rechazar_cotizacion(uuid) to authenticated;
grant execute on function public.reabrir_cotizacion(uuid) to authenticated;
grant execute on function public.revertir_aprobacion(uuid) to authenticated;
