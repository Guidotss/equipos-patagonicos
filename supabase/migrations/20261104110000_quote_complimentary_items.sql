-- La bonificación es explícita: los ceros históricos conservan su significado original.
alter table public.cotizacion_items
  add column is_complimentary boolean not null default false,
  add constraint quote_item_complimentary_price check (
    not is_complimentary or (precio_unitario is not null and precio_unitario = 0)
  );

create or replace function private.reemplazar_items(p_cotizacion_id uuid, p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Los ítems tienen que ser una lista' using errcode = 'P0001';
  end if;

  if exists (select 1 from jsonb_array_elements(p_items) i
    where i ? 'is_complimentary' and jsonb_typeof(i->'is_complimentary') is distinct from 'boolean') then
    raise exception 'La marca bonificada debe ser verdadera o falsa' using errcode = 'P0001';
  end if;

  delete from public.cotizacion_items where cotizacion_id = p_cotizacion_id;

  insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, cantidad, precio_unitario, is_complimentary, unidad)
  select
    p_cotizacion_id,
    e.orden::integer,
    coalesce(e.item ->> 'seccion', ''),
    e.item ->> 'descripcion',
    coalesce((e.item ->> 'cantidad')::numeric, 1),
    case when coalesce((e.item ->> 'is_complimentary')::boolean, false) then 0
      else (e.item ->> 'precio_unitario')::numeric end,
    coalesce((e.item ->> 'is_complimentary')::boolean, false),
    e.item ->> 'unidad'
  from jsonb_array_elements(p_items) with ordinality as e(item, orden);
end;
$$;

-- Copia una cotización como borrador nuevo (número nuevo, fecha de hoy). Con el mismo cliente es una
-- renegociación: queda enlazada con reemplaza_a. Con otro cliente no se copia el contacto.
create or replace function public.duplicar_cotizacion(p_id uuid, p_cliente_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.cotizaciones%rowtype;
  v_id uuid;
  v_mismo_cliente boolean;
  v_subject text;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.cotizaciones where id = p_id;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0001';
  end if;
  v_mismo_cliente := p_cliente_id is null or p_cliente_id = o.cliente_id;

  -- La copia reserva el sufijo dentro del límite de 500 caracteres, sin modificar el asunto original.
  v_subject := case
    when o.asunto ~* '(^|[[:space:]])bis[[:space:]]*$' then o.asunto
    when btrim(o.asunto) = '' then 'bis'
    else rtrim(left(rtrim(o.asunto), 496)) || ' bis'
  end;

  insert into public.cotizaciones (
    cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques,
    validez_dias, mostrar_total, fecha_proxima_actualizacion, reemplaza_a
  ) values (
    coalesce(p_cliente_id, o.cliente_id),
    case when v_mismo_cliente then o.contacto_id end,
    o.formato, o.plantilla_id, o.equipo_id, o.firmante_id, v_subject, o.intro, o.datos, o.bloques,
    o.validez_dias, o.mostrar_total, o.fecha_proxima_actualizacion,
    case when v_mismo_cliente then o.id end
  )
  returning id into v_id;

  insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, cantidad, precio_unitario, is_complimentary, unidad)
  select v_id, orden, seccion, descripcion, cantidad, precio_unitario, is_complimentary, unidad
  from public.cotizacion_items where cotizacion_id = p_id;

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
      where (i ? 'is_complimentary' and jsonb_typeof(i->'is_complimentary') is distinct from 'boolean')
        or jsonb_typeof(i->'descripcion') is distinct from 'string' or btrim(i->>'descripcion')=''
        or jsonb_typeof(i->'seccion') is distinct from 'string' or coalesce(i->>'unidad','') not in ('UNIDAD','JORNADA','HORA','SEMANA','MES','VIAJE')
        or case when jsonb_typeof(i->'cantidad')='number' then (i->>'cantidad')::numeric<=0 else true end)
     or exists (select 1 from jsonb_array_elements(p_contenido->'bloques') b
       where jsonb_typeof(b->'titulo') is distinct from 'string' or jsonb_typeof(b->'contenido') is distinct from 'string'
          or (b ? 'hidden' and jsonb_typeof(b->'hidden') is distinct from 'boolean')
          or (b ? 'oculto' and jsonb_typeof(b->'oculto') is distinct from 'boolean')) then
    raise exception 'Los ítems o textos de la plantilla no son válidos' using errcode='P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('seccion',i->>'seccion','descripcion',i->>'descripcion','cantidad',(i->>'cantidad')::numeric,'unidad',i->>'unidad','is_complimentary',coalesce((i->>'is_complimentary')::boolean,false))), '[]'::jsonb) into v_items from jsonb_array_elements(p_contenido->'items') i;
  select coalesce(jsonb_agg(jsonb_build_object('titulo',b->>'titulo','contenido',b->>'contenido','oculto',coalesce((b->>'hidden')::boolean,(b->>'oculto')::boolean,false))), '[]'::jsonb) into v_bloques from jsonb_array_elements(p_contenido->'bloques') b;
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
