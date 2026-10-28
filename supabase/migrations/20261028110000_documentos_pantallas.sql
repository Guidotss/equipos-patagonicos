-- Pantallas de documentos: campos opcionales, archivos validados y edición transaccional.
alter table public.documentos alter column fecha drop not null;
alter table public.documentos alter column fecha drop default;
create or replace function private.adjuntar_archivos(p_documento_id uuid, p_archivos jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_archivo jsonb;
  v_meta jsonb;
  v_orden integer;
  v_patron_ruta text;
begin
  if p_archivos is null or jsonb_typeof(p_archivos) <> 'array' or jsonb_array_length(p_archivos) = 0 then
    raise exception 'Subí al menos un archivo' using errcode = 'P0001';
  end if;

  -- Un archivo se vincula una sola vez (path es único en documento_archivos): se controla antes de insertar para
  -- dar el mensaje en vez del error de la restricción. Acá, repetido en la lista; en el loop, ya cargado.
  if (select count(e ->> 'path') <> count(distinct e ->> 'path') from jsonb_array_elements(p_archivos) as e) then
    raise exception 'Un archivo aparece dos veces' using errcode = 'P0001';
  end if;

  -- La ruta tiene que ser exactamente la que arma rutaArchivo (src/lib/documentos/archivos.ts) para el cliente
  -- del documento: ni la carpeta de otro cliente, ni "..", ni carpetas de más.
  select '^documentos/' || d.cliente_id
           || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
  into v_patron_ruta
  from public.documentos d
  where d.id = p_documento_id;

  select coalesce(max(orden), 0) into v_orden from public.documento_archivos where documento_id = p_documento_id;

  for v_archivo in select * from jsonb_array_elements(p_archivos) loop
    if (coalesce(v_archivo ->> 'path', '') ~ v_patron_ruta) is not true then
      raise exception 'El archivo no corresponde a la carpeta del cliente' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.documento_archivos a where a.path = v_archivo ->> 'path') then
      raise exception 'Ese archivo ya está cargado en un documento' using errcode = 'P0001';
    end if;
    if char_length(v_archivo ->> 'nombre_original') > 255 then
      raise exception 'El nombre del archivo puede tener hasta 255 caracteres' using errcode = 'P0001';
    end if;
    if coalesce(btrim(v_archivo ->> 'nombre_original'), '') = '' then
      raise exception 'Falta el nombre del archivo' using errcode = 'P0001';
    end if;

    select o.metadata into v_meta
    from storage.objects o
    where o.bucket_id = 'documentos' and o.name = v_archivo ->> 'path';
    if not found then
      raise exception 'No se encontró el archivo subido (%)', v_archivo ->> 'nombre_original' using errcode = 'P0001';
    end if;
    -- El bucket ya limita el tipo y el tamaño máximo, pero acepta archivos vacíos.
    if coalesce((v_meta ->> 'size')::bigint, 0) <= 0 then
      raise exception 'El archivo está vacío' using errcode = 'P0001';
    end if;

    v_orden := v_orden + 1;
    insert into public.documento_archivos (documento_id, path, nombre_original, mime, tamano, orden)
    values (
      p_documento_id,
      v_archivo ->> 'path',
      btrim(v_archivo ->> 'nombre_original'),
      lower(split_part(v_meta ->> 'mimetype', ';', 1)),
      (v_meta ->> 'size')::bigint,
      v_orden
    );
  end loop;
exception when unique_violation then
  raise exception 'Ese archivo ya está cargado. Volvé a seleccionarlo para subir una copia.' using errcode = 'P0001';
end;
$$;

create or replace function public.registrar_documento(
  p_datos jsonb,
  p_presupuestos uuid[],
  p_archivos jsonb,
  p_remitos uuid[] default '{}',
  p_aplicaciones jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.documentos%rowtype;
  v_id uuid;
begin
  perform private.exigir_usuario_activo();
  -- Antes de convertir p_datos: que sea un objeto, con cliente, equipo, fechas y monto bien escritos, textos dentro
  -- del máximo, el equipo existente y lo que piden los CHECK. Si no, la conversión o el insert darían un error crudo
  -- en vez del mensaje.
  perform private.validar_datos_documento(p_datos ->> 'tipo', p_datos);
  v := private.leer_datos_documento(p_datos);
  if v.cliente_id is null then
    raise exception 'Falta el cliente' using errcode = 'P0001';
  end if;
  perform private.validar_presupuestos(v.cliente_id, p_presupuestos);
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  -- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
  insert into public.documentos (
    cliente_id, tipo, numero, fecha, monto, tipo_comprobante, fecha_vencimiento, numero_oc_ref,
    periodo_desde, periodo_hasta, equipo_id, notas
  ) values (
    v.cliente_id, v.tipo, coalesce(btrim(v.numero), ''), v.fecha, v.monto,
    case when v.tipo = 'factura' then v.tipo_comprobante end,
    case when v.tipo = 'factura' then v.fecha_vencimiento end,
    case when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '') else '' end,
    case when v.tipo = 'remito' then v.periodo_desde end,
    case when v.tipo = 'remito' then v.periodo_hasta end,
    case when v.tipo = 'remito' then v.equipo_id end,
    coalesce(v.notas, '')
  )
  returning id into v_id;

  perform private.reemplazar_presupuestos(v_id, p_presupuestos);
  perform private.adjuntar_archivos(v_id, p_archivos);
  if v.tipo = 'factura' then
    perform private.vincular_remitos(v_id, v.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' then
    perform private.aplicar_orden_pago(v_id, v.cliente_id, v.monto, coalesce(p_aplicaciones, '[]'));
  end if;
  return v_id;
end;
$$;

create or replace function public.actualizar_documento(
  p_id uuid,
  p_datos jsonb,
  p_presupuestos uuid[] default null,
  p_remitos uuid[] default null,
  p_aplicaciones jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documentos%rowtype;
  v public.documentos%rowtype;
  v_cobrado numeric;
  v_presupuestos_nuevos uuid[];
begin
  perform private.exigir_usuario_activo();
  select * into o from public.documentos where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;

  -- Antes de convertir p_datos: que sea un objeto (no nulo), con cliente (aunque se ignore), equipo, fechas y monto
  -- bien escritos, textos dentro del máximo, el equipo existente y lo que piden los CHECK. Si no, la conversión o el
  -- update darían un error crudo (o, con p_datos nulo, vaciarían el documento).
  perform private.validar_datos_documento(coalesce(p_datos ->> 'tipo', o.tipo), p_datos);
  v := private.leer_datos_documento(p_datos);
  v.tipo := coalesce(v.tipo, o.tipo);

  -- Un remito cubierto por una factura anulada cuenta como libre (igual que en vincular_remitos).
  if v.tipo <> o.tipo and (
    exists (select 1 from public.documentos f where f.id = o.factura_id and f.deleted_at is null)
    or exists (select 1 from public.documentos r where r.factura_id = p_id)
    or exists (select 1 from public.op_facturas where op_id = p_id or factura_id = p_id)
  ) then
    raise exception 'Para cambiar el tipo, primero quitá los remitos o facturas vinculados' using errcode = 'P0001';
  end if;

  if v.tipo = 'factura' then
    select coalesce(sum(ofa.monto_aplicado), 0) into v_cobrado
    from public.op_facturas ofa
    join public.documentos op on op.id = ofa.op_id and op.deleted_at is null
    where ofa.factura_id = p_id;
    if v.monto < v_cobrado then
      raise exception 'El monto de la factura no puede ser menor a lo ya cobrado' using errcode = 'P0001';
    end if;
  end if;

  -- Si no se reemplazan las aplicaciones, las que ya tiene la OP tienen que seguir entrando en su monto.
  if v.tipo = 'orden_pago' and p_aplicaciones is null
    and v.monto < (select coalesce(sum(monto_aplicado), 0) from public.op_facturas where op_id = p_id) then
    raise exception 'Lo aplicado a facturas supera el monto de la orden de pago' using errcode = 'P0001';
  end if;

  if p_presupuestos is not null then
    if cardinality(p_presupuestos) = 0 then
      raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
    end if;
    v_presupuestos_nuevos := array(
      select p.id from unnest(p_presupuestos) as p(id)
      where not exists (
        select 1 from public.documento_presupuestos dp where dp.documento_id = p_id and dp.cotizacion_id = p.id
      )
    );
    if cardinality(v_presupuestos_nuevos) > 0 then
      perform private.validar_presupuestos(o.cliente_id, v_presupuestos_nuevos);
    end if;
  end if;
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  -- Los campos que no son del tipo se descartan (los CHECK documentos_campos_de_* no los aceptan).
  update public.documentos set
    tipo = v.tipo,
    numero = coalesce(btrim(v.numero), ''),
    fecha = case when p_datos ? 'fecha' then v.fecha else o.fecha end,
    monto = v.monto,
    tipo_comprobante = case when v.tipo = 'factura' then v.tipo_comprobante end,
    fecha_vencimiento = case when v.tipo = 'factura' then v.fecha_vencimiento end,
    numero_oc_ref = case when v.tipo = 'factura' then coalesce(btrim(v.numero_oc_ref), '') else '' end,
    periodo_desde = case when v.tipo = 'remito' then v.periodo_desde end,
    periodo_hasta = case when v.tipo = 'remito' then v.periodo_hasta end,
    equipo_id = case when v.tipo = 'remito' then v.equipo_id end,
    factura_id = case when v.tipo = 'remito' then o.factura_id end,
    notas = coalesce(v.notas, '')
  where id = p_id;

  if p_presupuestos is not null then
    perform private.reemplazar_presupuestos(p_id, p_presupuestos);
  end if;
  if v.tipo = 'factura' and p_remitos is not null then
    perform private.vincular_remitos(p_id, o.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' and p_aplicaciones is not null then
    perform private.aplicar_orden_pago(p_id, o.cliente_id, v.monto, p_aplicaciones);
  end if;
end;
$$;

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

  if char_length(coalesce(p_motivo, '')) > 2000 then
    raise exception 'El motivo puede tener hasta 2000 caracteres' using errcode = 'P0001';
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



create or replace function public.actualizar_documento_con_archivos(
  p_id uuid, p_datos jsonb, p_presupuestos uuid[], p_remitos uuid[], p_aplicaciones jsonb,
  p_archivos jsonb default '[]', p_quitar uuid[] default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare v_archivo uuid;
begin
  perform private.exigir_usuario_activo();
  perform public.actualizar_documento(p_id, p_datos, p_presupuestos, p_remitos, p_aplicaciones);
  if jsonb_typeof(p_archivos) is distinct from 'array' then
    raise exception 'Los archivos tienen que ser una lista' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_archivos) > 0 then
    perform public.agregar_archivos(p_id, p_archivos);
  end if;
  foreach v_archivo in array coalesce(p_quitar, '{}') loop
    if not exists (select 1 from public.documento_archivos where id = v_archivo and documento_id = p_id) then
      raise exception 'El archivo no pertenece al documento' using errcode = 'P0001';
    end if;
    perform public.quitar_archivo(v_archivo);
  end loop;
end;
$$;
revoke all on function public.actualizar_documento_con_archivos(uuid,jsonb,uuid[],uuid[],jsonb,jsonb,uuid[]) from public, anon;
grant execute on function public.actualizar_documento_con_archivos(uuid,jsonb,uuid[],uuid[],jsonb,jsonb,uuid[]) to authenticated;

create or replace function public.buscar_presupuestos(texto text default '', estado text default '', cliente uuid default null)
returns setof public.v_presupuestos language sql stable security invoker set search_path = '' as $$
  select p.* from public.v_presupuestos p
  where (coalesce(estado, '') = '' or p.presupuesto_estado = estado)
    and (cliente is null or p.cliente_id = cliente)
    and (coalesce(texto, '') = '' or extensions.unaccent(lower(p.cliente_razon_social || ' ' || p.asunto || ' ' || p.numero::text))
      like '%' || replace(replace(replace(extensions.unaccent(lower(texto)), '\', '\\'), '%', '\%'), '_', '\_') || '%');
$$;
revoke all on function public.buscar_presupuestos(text,text,uuid) from public, anon;
grant execute on function public.buscar_presupuestos(text,text,uuid) to authenticated;
