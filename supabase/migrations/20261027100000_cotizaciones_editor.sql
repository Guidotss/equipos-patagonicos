-- supabase/migrations/20261027100000_cotizaciones_editor.sql
-- Editor de cotizaciones (plan 3B):
-- 1. guardar_cotizacion con control de versión: con p_id exige el updated_at que vio la pantalla, igual que
--    marcar_enviada y aprobar_cotizacion. Sin esto, el último que guarda pisa lo que guardó otro (u otra pestaña).
-- 2. buscar_cotizaciones para la lista: sin acentos, por número parcial, razón social y asunto, con filtros.

-- Se borra la firma de 3 parámetros: si quedaran las dos, una llamada con p_datos, p_items y p_id sería ambigua.
drop function public.guardar_cotizacion(jsonb, jsonb, uuid);

-- Crea (p_id null) o actualiza una cotización en borrador o enviada, con todos sus ítems, en una transacción.
-- Solo se editan las armadas en la app: el documento de una cargada (importada) es su PDF original
-- (si se cargó mal, se borra y se vuelve a cargar: ver borrar_cotizacion).
-- Al actualizar, bloquea la fila antes de validar (un guardado, un envío o una aprobación simultáneos esperan) y
-- exige p_updated_at: el updated_at de la fila que se vio al editar, comparado al milisegundo (exigir_version).
-- Sin la clave notas conserva las que tenía: el editor no las maneja y no las manda.
create function public.guardar_cotizacion(
  p_datos jsonb,
  p_items jsonb,
  p_id uuid default null,
  p_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  c public.cotizaciones%rowtype;
  v_id uuid;
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  if p_id is null then
    insert into public.cotizaciones (
      fecha, cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro,
      datos, bloques, validez_dias, mostrar_total, fecha_proxima_actualizacion, notas, reemplaza_a
    ) values (
      coalesce(v.fecha, private.hoy_argentina()), v.cliente_id, v.contacto_id, v.formato, v.plantilla_id,
      v.equipo_id, v.firmante_id, coalesce(v.asunto, ''), coalesce(v.intro, ''), coalesce(v.datos, '{}'),
      coalesce(v.bloques, '[]'), coalesce(v.validez_dias, 30), coalesce(v.mostrar_total, false),
      v.fecha_proxima_actualizacion, coalesce(v.notas, ''), v.reemplaza_a
    )
    returning id into v_id;
  else
    select * into c from public.cotizaciones where id = p_id for update;
    if not found or c.estado not in ('borrador', 'enviada') or c.origen <> 'app' then
      raise exception 'La cotización no existe o ya no se puede editar' using errcode = 'P0001';
    end if;
    perform private.exigir_version(c.updated_at, p_updated_at);

    update public.cotizaciones set
      fecha = coalesce(v.fecha, fecha),
      cliente_id = v.cliente_id,
      contacto_id = v.contacto_id,
      formato = v.formato,
      plantilla_id = v.plantilla_id,
      equipo_id = v.equipo_id,
      firmante_id = v.firmante_id,
      asunto = coalesce(v.asunto, ''),
      intro = coalesce(v.intro, ''),
      datos = coalesce(v.datos, '{}'),
      bloques = coalesce(v.bloques, '[]'),
      validez_dias = coalesce(v.validez_dias, 30),
      mostrar_total = coalesce(v.mostrar_total, false),
      fecha_proxima_actualizacion = v.fecha_proxima_actualizacion,
      notas = coalesce(v.notas, c.notas)
    where id = p_id;
    v_id := p_id;
  end if;

  perform private.reemplazar_items(v_id, p_items);
  return v_id;
end;
$$;

grant execute on function public.guardar_cotizacion(jsonb, jsonb, uuid, timestamptz) to authenticated;

-- Búsqueda de la lista. SECURITY INVOKER: corre con la RLS de quien llama (un usuario inactivo no ve nada).
-- texto: sin acentos contra la razón social y el asunto, o el comienzo del número si el texto es solo un número
-- (con "N°", "nro" o "#" adelante o sin nada). Los dígitos de otro texto no buscan por número: todos los números
-- empiezan con 1, así que "11 de julio" o "Loma Campana 1" traerían todas las cotizaciones.
-- estado: '' = todos; 'enviada' = enviadas al día; 'vencida' = enviadas fuera de validez (como la pastilla);
-- el resto, exacto. desde/hasta: sobre la fecha de la cotización, inclusive.
-- La paginación y el conteo los hace PostgREST (range + count=exact). Los parámetros se nombran con el nombre
-- de la función: en una función SQL, una columna con el mismo nombre (estado) les gana.
create function public.buscar_cotizaciones(
  texto text default '',
  estado text default '',
  cliente uuid default null,
  desde date default null,
  hasta date default null
)
returns setof public.v_cotizaciones
language sql
stable
security invoker
set search_path = ''
as $$
  with consulta as (
    select extensions.unaccent(lower(btrim(coalesce(buscar_cotizaciones.texto, '')))) as normalizado
  ),
  patron as (
    select
      normalizado,
      case
        when normalizado ~ '^(n[°º.]?|nro\.?|#)?\s*\d+$' then regexp_replace(normalizado, '\D', '', 'g')
        else ''
      end as digitos,
      '%' || replace(replace(replace(normalizado, '\', '\\'), '%', '\%'), '_', '\_') || '%' as como
    from consulta
  )
  select v.*
  from public.v_cotizaciones v, patron p
  where (
      p.normalizado = ''
      or extensions.unaccent(lower(v.cliente_razon_social)) like p.como
      or extensions.unaccent(lower(v.asunto)) like p.como
      or (p.digitos <> '' and v.numero::text like p.digitos || '%')
    )
    and case coalesce(buscar_cotizaciones.estado, '')
      when '' then true
      when 'enviada' then v.estado = 'enviada' and not v.vencida
      when 'vencida' then v.vencida
      else v.estado = buscar_cotizaciones.estado
    end
    and (buscar_cotizaciones.cliente is null or v.cliente_id = buscar_cotizaciones.cliente)
    and (buscar_cotizaciones.desde is null or v.fecha >= buscar_cotizaciones.desde)
    and (buscar_cotizaciones.hasta is null or v.fecha <= buscar_cotizaciones.hasta)
  order by v.numero desc;
$$;

grant execute on function public.buscar_cotizaciones(text, text, uuid, date, date) to authenticated;
