-- Presenta un remito cargado por un gruista.
create or replace function public.submit_crane_delivery_note(p_id uuid, p_data jsonb, p_files jsonb) returns uuid language plpgsql security definer
set search_path = '' as $$
declare equipment public.equipos;
existing_note public.crane_delivery_notes;
ticket public.crane_delivery_note_uploads;
object_metadata jsonb;
file_entry jsonb;
position_value integer := 0;
begin perform 1
from public.profiles
where id = auth.uid() for share;
perform private.require_crane_operator();
if p_id is null then raise exception 'El identificador del remito no es válido' using errcode = '22023';
end if;
-- Serializa también un primer envío concurrente, antes de que exista la fila.
perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
select * into existing_note
from public.crane_delivery_notes
where id = p_id for
update;
if found then if existing_note.operator_id = auth.uid()
and existing_note.submission_data = p_data
and existing_note.submission_files = p_files then return existing_note.id;
end if;
raise exception 'El identificador ya se usó con otros datos' using errcode = '23505';
end if;
-- Un reintento histórico se resuelve antes de exigir las reglas de los envíos nuevos.
perform private.validate_crane_note_input(p_data, p_files);
if p_data->>'budgetId' is not null then raise exception 'Solo Administración puede vincular el remito a un presupuesto' using errcode = '42501';
end if;
equipment := private.require_intake_crane((p_data->>'equipmentId')::uuid);
-- El orden de bloqueo evita interbloqueos si dos formularios contienen los mismos archivos.
perform 1
from public.crane_delivery_note_uploads
where path in (
    select f->>'path'
    from jsonb_array_elements(p_files) f
  )
order by id for
update;
insert into public.crane_delivery_notes(
    id,
    operator_id,
    equipment_id,
    equipment_name,
    number,
    service_date,
    customer_name,
    work_description,
    notes,
    submission_data,
    submission_files
  )
values(
    p_id,
    auth.uid(),
    equipment.id,
    equipment.nombre,
    coalesce(btrim(p_data->>'number'), ''),
    (p_data->>'serviceDate')::date,
    coalesce(btrim(p_data->>'customerName'), ''),
    coalesce(btrim(p_data->>'workDescription'), ''),
    coalesce(p_data->>'notes', ''),
    p_data,
    p_files
  );
for file_entry in
select value
from jsonb_array_elements(p_files) loop
select * into ticket
from public.crane_delivery_note_uploads
where path = file_entry->>'path';
if not found
or ticket.operator_id <> auth.uid()
or ticket.equipment_id <> equipment.id
or ticket.expires_at <= now()
or ticket.consumed_note_id is not null then raise exception 'La carga no te pertenece, venció o ya se utilizó' using errcode = '42501';
end if;
select metadata into object_metadata
from storage.objects
where bucket_id = 'documentos'
  and name = ticket.path for share;
if not found
or object_metadata->>'mimetype' is distinct
from ticket.mime
  or not pg_input_is_valid(coalesce(object_metadata->>'size', ''), 'bigint') then raise exception 'Subí el archivo con el tipo y el tamaño reservados' using errcode = '22023';
end if;
if (object_metadata->>'size')::bigint is distinct
from ticket.expected_size then raise exception 'El tamaño del archivo no coincide con la carga reservada' using errcode = '22023';
end if;
position_value := position_value + 1;
insert into public.crane_delivery_note_files(
    note_id,
    upload_id,
    path,
    original_name,
    mime,
    size,
    position
  )
values(
    p_id,
    ticket.id,
    ticket.path,
    file_entry->>'originalName',
    ticket.mime,
    ticket.expected_size,
    position_value
  );
update public.crane_delivery_note_uploads
set consumed_note_id = p_id
where id = ticket.id;
end loop;
return p_id;
end;
$$;