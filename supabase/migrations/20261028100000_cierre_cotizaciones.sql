-- Respuestas atómicas, seguimiento y contenido reutilizable del cierre del MVP.
create or replace function public.guardar_cotizacion_versionada(
  p_datos jsonb, p_items jsonb, p_id uuid default null, p_updated_at timestamptz default null
) returns table (id uuid, numero bigint, version timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.exigir_usuario_activo();
  v_id := public.guardar_cotizacion(p_datos, p_items, p_id, p_updated_at);
  return query select c.id, c.numero, c.updated_at from public.cotizaciones c where c.id = v_id;
end;
$$;
grant execute on function public.guardar_cotizacion_versionada(jsonb,jsonb,uuid,timestamptz) to authenticated;

create or replace function public.actualizar_seguimiento_cotizacion(p_id uuid, p_updated_at timestamptz, p_notas text, p_fecha date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.cotizaciones%rowtype;
begin
  perform private.exigir_usuario_activo();
  select * into c from public.cotizaciones where id = p_id for update;
  if not found then raise exception 'La cotización no existe' using errcode='P0001'; end if;
  perform private.exigir_version(c.updated_at, p_updated_at);
  if p_notas is null or length(p_notas) > 2000 then raise exception 'Las notas admiten hasta 2000 caracteres' using errcode='P0001'; end if;
  update public.cotizaciones set notas=btrim(p_notas), fecha_proxima_actualizacion=p_fecha where id=p_id;
end;
$$;
grant execute on function public.actualizar_seguimiento_cotizacion(uuid,timestamptz,text,date) to authenticated;

create or replace function public.guardar_plantilla_editor(p_nombre text,p_contenido jsonb,p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_validez integer; v_items jsonb; v_bloques jsonb;
begin
  perform private.exigir_usuario_activo();
  if p_nombre is null or length(btrim(p_nombre)) not between 1 and 100 then raise exception 'Ingresá un nombre de hasta 100 caracteres' using errcode='P0001'; end if;
  if p_contenido is null or coalesce(p_contenido->>'formato','') not in ('mensual','jornada')
     or jsonb_typeof(p_contenido->'items') is distinct from 'array'
     or jsonb_typeof(p_contenido->'bloques') is distinct from 'array' then
    raise exception 'El contenido de la plantilla no es válido' using errcode='P0001';
  end if;
  v_validez := (p_contenido->>'validez_dias')::integer;
  if v_validez is null or v_validez not between 1 and 365 or jsonb_array_length(p_contenido->'items')>200
     or jsonb_array_length(p_contenido->'bloques')>100 then raise exception 'Revisá los ítems y la validez' using errcode='P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_contenido->'items') i
      where jsonb_typeof(i->'descripcion') is distinct from 'string' or btrim(i->>'descripcion')=''
        or jsonb_typeof(i->'seccion') is distinct from 'string' or coalesce(i->>'unidad','') not in ('UNIDAD','JORNADA','HORA','SEMANA','MES','VIAJE')
        or case when jsonb_typeof(i->'cantidad')='number' then (i->>'cantidad')::numeric<=0 else true end)
     or exists (select 1 from jsonb_array_elements(p_contenido->'bloques') b
       where jsonb_typeof(b->'titulo') is distinct from 'string' or jsonb_typeof(b->'contenido') is distinct from 'string'
          or (b ? 'oculto' and jsonb_typeof(b->'oculto') is distinct from 'boolean')) then
    raise exception 'Los ítems o textos de la plantilla no son válidos' using errcode='P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('seccion',i->>'seccion','descripcion',i->>'descripcion','cantidad',(i->>'cantidad')::numeric,'unidad',i->>'unidad')), '[]'::jsonb) into v_items from jsonb_array_elements(p_contenido->'items') i;
  select coalesce(jsonb_agg(jsonb_build_object('titulo',b->>'titulo','contenido',b->>'contenido','oculto',coalesce((b->>'oculto')::boolean,false))), '[]'::jsonb) into v_bloques from jsonb_array_elements(p_contenido->'bloques') b;
  if p_id is null then
    insert into public.plantillas(nombre,formato,asunto,intro,validez_dias,items,bloques)
    values(btrim(p_nombre),p_contenido->>'formato',coalesce(p_contenido->>'asunto',''),coalesce(p_contenido->>'intro',''),v_validez,v_items,v_bloques) returning id into v_id;
  else
    update public.plantillas set nombre=btrim(p_nombre),formato=p_contenido->>'formato',asunto=coalesce(p_contenido->>'asunto',''),intro=coalesce(p_contenido->>'intro',''),validez_dias=v_validez,items=v_items,bloques=v_bloques where id=p_id returning id into v_id;
    if not found then raise exception 'La plantilla no existe' using errcode='P0001'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Ya existe una plantilla con ese nombre' using errcode='P0001';
end;
$$;
grant execute on function public.guardar_plantilla_editor(text,jsonb,uuid) to authenticated;

create or replace function public.eliminar_plantilla(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_usuario_activo();
  perform 1 from public.plantillas where id=p_id for update;
  if not found then raise exception 'La plantilla no existe' using errcode='P0001'; end if;
  -- Las usadas se archivan: la referencia de una cotización aprobada permanece intacta.
  if exists (select 1 from public.cotizaciones where plantilla_id=p_id) then
    update public.plantillas set activa=false where id=p_id;
  else delete from public.plantillas where id=p_id;
  end if;
end;
$$;
grant execute on function public.eliminar_plantilla(uuid) to authenticated;

create or replace function public.cargar_cotizacion_existente(p_datos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o storage.objects%rowtype;
begin
  perform private.exigir_usuario_activo();
  select * into o from storage.objects where bucket_id='documentos' and name=p_datos->>'archivo_original_path';
  if not found or left(o.name,11)<>'importadas/'
     or lower(btrim(split_part(o.metadata->>'mimetype',';',1))) is distinct from 'application/pdf'
     or (o.metadata->>'size')::bigint not between 1 and 10485760 then
    raise exception 'Subí un PDF válido de hasta 10 MB' using errcode='P0001';
  end if;
  return public.importar_cotizacion(p_datos);
end;
$$;
grant execute on function public.cargar_cotizacion_existente(jsonb) to authenticated;

create or replace function public.aprobar_con_orden_compra(p_id uuid,p_updated_at timestamptz,p_pdf_path text,p_documento jsonb,p_archivos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_cliente uuid; v_doc uuid; v_fecha date;
begin
  perform private.exigir_usuario_activo();
  select cliente_id into v_cliente from public.cotizaciones where id=p_id for update;
  if not found then raise exception 'La cotización no existe' using errcode='P0001'; end if;
  if p_documento->>'tipo' is distinct from 'orden_compra' then raise exception 'Elegí una orden de compra' using errcode='P0001'; end if;
  v_fecha := coalesce((p_documento->>'fecha')::date,private.hoy_argentina());
  perform public.aprobar_cotizacion(p_id,p_updated_at,nullif(p_pdf_path,''),v_fecha);
  v_doc := public.registrar_documento(p_documento || jsonb_build_object('cliente_id',v_cliente),array[p_id],p_archivos,array[]::uuid[],'[]'::jsonb);
  return v_doc;
end;
$$;
grant execute on function public.aprobar_con_orden_compra(uuid,timestamptz,text,jsonb,jsonb) to authenticated;
