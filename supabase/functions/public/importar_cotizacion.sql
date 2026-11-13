-- Importa una cotización desde el contrato anterior.
create or replace function public.importar_cotizacion(p_datos jsonb) returns uuid language plpgsql security definer
set search_path = '' as $$
declare v public.cotizaciones %rowtype;
v_id uuid;
v_hoy date := private.hoy_argentina();
v_fecha date;
v_fecha_aprobacion date;
v_archivo storage.objects %rowtype;
begin perform private.exigir_usuario_activo();
v := jsonb_populate_record(null::public.cotizaciones, p_datos);
v_fecha := coalesce(v.fecha, v_hoy);
if v.numero is null
or v.numero <= 0 then raise exception 'Ingresá el número de la cotización' using errcode = 'P0001';
end if;
if v.estado is null
or v.estado not in ('enviada', 'aprobada') then raise exception 'Una cotización existente se carga como enviada o aprobada' using errcode = 'P0001';
end if;
if v.estado = 'aprobada' then v_fecha_aprobacion := coalesce(v.fecha_aprobacion, v_fecha);
if v_fecha_aprobacion < v_fecha then raise exception 'La fecha de aprobación no puede ser anterior a la cotización' using errcode = 'P0001';
end if;
end if;
if v.archivo_original_path is null
or left(v.archivo_original_path, 11) <> 'importadas/' then raise exception 'Falta el PDF de la cotización' using errcode = 'P0001';
end if;
select * into v_archivo
from storage.objects
where bucket_id = 'documentos'
  and name = v.archivo_original_path;
if not found
or lower(
  btrim(
    split_part(v_archivo.metadata->>'mimetype', ';', 1)
  )
) is distinct
from 'application/pdf'
  or coalesce((v_archivo.metadata->>'size')::bigint, 0) not between 1 and 10485760 then raise exception 'Subí un PDF válido de hasta 10 MB' using errcode = 'P0001';
end if;
perform private.validar_contacto(v.cliente_id, v.contacto_id);
if exists (
  select 1
  from public.cotizaciones
  where numero = v.numero
) then raise exception 'Ya existe una cotización con el número %',
v.numero using errcode = 'P0001';
end if;
insert into public.cotizaciones (
    numero,
    origen,
    fecha,
    cliente_id,
    contacto_id,
    formato,
    asunto,
    estado,
    fecha_aprobacion,
    presupuesto_estado,
    archivo_original_path,
    notas
  )
values (
    v.numero,
    'importada',
    v_fecha,
    v.cliente_id,
    v.contacto_id,
    coalesce(v.formato, 'jornada'),
    coalesce(v.asunto, ''),
    v.estado,
    v_fecha_aprobacion,
    case
      when v.estado = 'aprobada' then 'en_curso'
    end,
    v.archivo_original_path,
    coalesce(v.notas, '')
  )
returning id into v_id;
perform private.avanzar_numeracion(v.numero);
return v_id;
end;
$$;