-- Integridad de importación, plantillas y aprobación de cotizaciones cargadas.
create or replace function public.importar_cotizacion(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  v_id uuid;
  v_hoy date := private.hoy_argentina();
  v_fecha date;
  v_fecha_aprobacion date;
  v_archivo storage.objects%rowtype;
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);
  v_fecha := coalesce(v.fecha, v_hoy);

  if v.numero is null or v.numero <= 0 then
    raise exception 'Ingresá el número de la cotización' using errcode = 'P0001';
  end if;
  if v.estado is null or v.estado not in ('enviada', 'aprobada') then
    raise exception 'Una cotización existente se carga como enviada o aprobada' using errcode = 'P0001';
  end if;
  if v.estado = 'aprobada' then
    v_fecha_aprobacion := coalesce(v.fecha_aprobacion, v_fecha);
    if v_fecha_aprobacion < v_fecha then
      raise exception 'La fecha de aprobación no puede ser anterior a la cotización' using errcode = 'P0001';
    end if;
  end if;
  if v.archivo_original_path is null or left(v.archivo_original_path, 11) <> 'importadas/' then
    raise exception 'Falta el PDF de la cotización' using errcode = 'P0001';
  end if;
  select * into v_archivo from storage.objects where bucket_id='documentos' and name=v.archivo_original_path;
  if not found or lower(btrim(split_part(v_archivo.metadata->>'mimetype',';',1))) is distinct from 'application/pdf'
     or coalesce((v_archivo.metadata->>'size')::bigint,0) not between 1 and 10485760 then
    raise exception 'Subí un PDF válido de hasta 10 MB' using errcode='P0001';
  end if;
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  if exists (select 1 from public.cotizaciones where numero = v.numero) then
    raise exception 'Ya existe una cotización con el número %', v.numero using errcode = 'P0001';
  end if;

  insert into public.cotizaciones (
    numero, origen, fecha, cliente_id, contacto_id, formato, asunto, estado,
    fecha_aprobacion, presupuesto_estado, archivo_original_path, notas
  ) values (
    v.numero, 'importada', v_fecha, v.cliente_id, v.contacto_id,
    coalesce(v.formato, 'jornada'), coalesce(v.asunto, ''), v.estado, v_fecha_aprobacion,
    case when v.estado = 'aprobada' then 'en_curso' end,
    v.archivo_original_path, coalesce(v.notas, '')
  )
  returning id into v_id;

  perform private.avanzar_numeracion(v.numero);
  return v_id;
end;
$$;

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
