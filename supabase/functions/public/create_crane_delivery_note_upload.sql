-- Reserva la carga de archivos de un remito de obra.
create function public.create_crane_delivery_note_upload(
  p_mime text,
  p_size bigint,
  p_equipment_id uuid default null
) returns table(upload_id uuid, path text) language plpgsql security definer
set search_path = '' as $$
declare equipment public.equipos;
upload_id_value uuid := gen_random_uuid();
path_value text;
begin equipment := private.require_intake_crane(p_equipment_id);
if p_mime is null
or p_mime not in ('application/pdf', 'image/jpeg', 'image/png')
or p_size is null
or p_size not between 1 and 10485760 then raise exception 'Subí un PDF, JPG o PNG de hasta 10 MB' using errcode = '22023';
end if;
path_value := 'documentos/crane-operators/' || auth.uid()::text || '/' || upload_id_value::text || case
  p_mime
  when 'application/pdf' then '.pdf'
  when 'image/jpeg' then '.jpg'
  else '.png'
end;
insert into public.crane_delivery_note_uploads(
    id,
    operator_id,
    equipment_id,
    path,
    mime,
    expected_size
  )
values(
    upload_id_value,
    auth.uid(),
    equipment.id,
    path_value,
    p_mime,
    p_size
  );
return query
select upload_id_value,
  path_value;
end;
$$;