begin;

-- La recepción registra la grúa real y reserva los vínculos comerciales para Administración.
alter table public.crane_delivery_notes
  drop constraint crane_delivery_notes_customer_name_check,
  drop constraint crane_delivery_notes_work_description_check,
  add constraint crane_delivery_notes_customer_name_check check (char_length(customer_name) <= 2000),
  add constraint crane_delivery_notes_work_description_check check (char_length(work_description) <= 2000);

create function public.list_operator_cranes()
returns table(equipment_id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_crane_operator();
  return query select e.id, e.nombre from public.equipos e where e.activo order by e.nombre, e.id;
end;
$$;

-- Durante la transición se conserva la forma de la respuesta anterior sin información comercial.
create or replace function public.get_crane_operator_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare equipment public.equipos;
begin
  perform private.require_crane_operator();
  select e.* into equipment from public.crane_operator_assignments a
    join public.equipos e on e.id = a.equipment_id where a.user_id = auth.uid();
  return jsonb_build_object('equipment', case when equipment.id is null then null else
    jsonb_build_object('id', equipment.id, 'name', equipment.nombre, 'active', equipment.activo) end, 'jobs', '[]'::jsonb);
end;
$$;

-- La asignación se consulta únicamente para clientes que aún no envían la grúa.
create function private.require_intake_crane(p_equipment_id uuid)
returns public.equipos language plpgsql security definer set search_path = '' as $$
declare equipment public.equipos;
begin
  if p_equipment_id is null then
    return private.require_current_crane();
  end if;
  perform 1 from public.profiles where id = auth.uid() for share;
  perform private.require_crane_operator();
  select * into equipment from public.equipos where id = p_equipment_id and activo for share;
  if not found then
    raise exception 'La grúa no existe o está inactiva' using errcode = '42501';
  end if;
  return equipment;
end;
$$;

create or replace function private.can_upload_crane_file(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  -- La firma conserva upsert durante dos horas; no se concede aunque el objeto todavía no exista.
  select private.is_crane_operator()
    and coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-upsert', 'false') = 'false'
    and exists (
    select 1 from public.crane_delivery_note_uploads u
    join public.equipos e on e.id = u.equipment_id and e.activo
    where u.operator_id = auth.uid() and u.path = p_path and u.expires_at > now() and u.consumed_note_id is null
  );
$$;

-- La firma anterior se reemplaza para que PostgREST tenga una única función resoluble.
drop function public.create_crane_delivery_note_upload(text,bigint);

create function public.create_crane_delivery_note_upload(p_mime text, p_size bigint, p_equipment_id uuid default null)
returns table(upload_id uuid, path text) language plpgsql security definer set search_path = '' as $$
declare equipment public.equipos; upload_id_value uuid := gen_random_uuid(); path_value text;
begin
  equipment := private.require_intake_crane(p_equipment_id);
  if p_mime is null or p_mime not in ('application/pdf', 'image/jpeg', 'image/png')
    or p_size is null or p_size not between 1 and 10485760 then
    raise exception 'Subí un PDF, JPG o PNG de hasta 10 MB' using errcode = '22023';
  end if;
  path_value := 'documentos/crane-operators/' || auth.uid()::text || '/' || upload_id_value::text ||
    case p_mime when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' else '.png' end;
  insert into public.crane_delivery_note_uploads(id, operator_id, equipment_id, path, mime, expected_size)
    values(upload_id_value, auth.uid(), equipment.id, path_value, p_mime, p_size);
  return query select upload_id_value, path_value;
end;
$$;

create or replace function private.validate_crane_note_input(p_data jsonb, p_files jsonb)
returns void language plpgsql set search_path = '' as $$
declare key_name text; file_entry jsonb;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Los datos del remito tienen que ser un objeto' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_data) k where k not in
    ('budgetId', 'equipmentId', 'number', 'serviceDate', 'customerName', 'workDescription', 'notes')) then
    raise exception 'El remito contiene campos no permitidos' using errcode = '22023';
  end if;
  foreach key_name in array array['number', 'customerName', 'workDescription', 'notes', 'serviceDate', 'budgetId', 'equipmentId'] loop
    if p_data ? key_name and jsonb_typeof(p_data->key_name) not in ('string', 'null') then
      raise exception 'Los campos del remito tienen que ser texto' using errcode = '22023';
    end if;
  end loop;
  if p_data->>'serviceDate' is null or p_data->>'serviceDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or not pg_input_is_valid(p_data->>'serviceDate', 'date') then
    raise exception 'Ingresá una fecha válida' using errcode = '22023';
  end if;
  if p_data->>'budgetId' is not null and p_data->>'budgetId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'El presupuesto no es válido' using errcode = '22023';
  end if;
  if p_data ? 'equipmentId' and (p_data->>'equipmentId' is null
    or p_data->>'equipmentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Elegí una grúa válida' using errcode = '22023';
  end if;
  if length(coalesce(p_data->>'number', '')) > 100
    or length(coalesce(p_data->>'notes', '')) > 2000
    or length(coalesce(p_data->>'customerName', '')) > 2000
    or length(coalesce(p_data->>'workDescription', '')) > 2000 then
    raise exception 'Revisá los límites de texto del remito' using errcode = '22023';
  end if;
  if jsonb_typeof(p_files) is distinct from 'array' then
    raise exception 'Subí entre 1 y 50 archivos' using errcode = '22023';
  end if;
  if jsonb_array_length(p_files) not between 1 and 50 then
    raise exception 'Subí entre 1 y 50 archivos' using errcode = '22023';
  end if;
  for file_entry in select value from jsonb_array_elements(p_files) loop
    if jsonb_typeof(file_entry) is distinct from 'object' then
      raise exception 'El archivo no es válido' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(file_entry) k where k not in ('path', 'originalName'))
      or jsonb_typeof(file_entry->'path') is distinct from 'string'
      or jsonb_typeof(file_entry->'originalName') is distinct from 'string'
      or length(file_entry->>'originalName') not between 1 and 255 or btrim(file_entry->>'originalName') = '' then
      raise exception 'Revisá la ruta y el nombre original del archivo' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) <> count(distinct f->>'path') from jsonb_array_elements(p_files) f) then
    raise exception 'Un archivo aparece dos veces' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.finalize_crane_delivery_note(p_note_id uuid, p_budget_id uuid, p_linked_by uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare note public.crane_delivery_notes; budget public.cotizaciones; document_id_value uuid;
begin
  select * into note from public.crane_delivery_notes where id = p_note_id for update;
  if not found then raise exception 'El remito recibido no existe' using errcode = '22023'; end if;
  if note.status = 'linked' then
    if note.linked_budget_id = p_budget_id then
      return note.document_id;
    end if;
    raise exception 'El remito ya está vinculado a otro presupuesto' using errcode = '23505';
  end if;
  select * into budget from public.cotizaciones where id = p_budget_id for share;
  if not found or budget.estado <> 'aprobada' or budget.presupuesto_estado = 'anulado' then
    raise exception 'Elegí un presupuesto aprobado que no esté anulado' using errcode = '22023';
  end if;
  insert into public.documentos(cliente_id, tipo, numero, fecha, equipo_id, notas, created_by)
    values(budget.cliente_id, 'remito', note.number, note.service_date, note.equipment_id,
      concat_ws(E'\n',
        case when note.customer_name <> '' then 'Cliente informado: ' || note.customer_name end,
        case when note.work_description <> '' then 'Trabajo realizado: ' || note.work_description end,
        case when note.notes <> '' then 'Observaciones: ' || note.notes end), note.operator_id)
    returning id into document_id_value;
  insert into public.documento_presupuestos(documento_id, cotizacion_id) values(document_id_value, budget.id);
  insert into public.documento_archivos(documento_id, path, nombre_original, mime, tamano, orden)
    select document_id_value, path, original_name, mime, size, position
    from public.crane_delivery_note_files where note_id = note.id order by position;
  update public.crane_delivery_notes set status = 'linked', document_id = document_id_value,
    linked_budget_id = budget.id, linked_by = p_linked_by, linked_at = now() where id = note.id;
  return document_id_value;
end;
$$;

create or replace function public.submit_crane_delivery_note(p_id uuid, p_data jsonb, p_files jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  equipment public.equipos; existing_note public.crane_delivery_notes;
  ticket public.crane_delivery_note_uploads; object_metadata jsonb; file_entry jsonb;
  position_value integer := 0;
begin
  perform 1 from public.profiles where id = auth.uid() for share;
  perform private.require_crane_operator();
  if p_id is null then raise exception 'El identificador del remito no es válido' using errcode = '22023'; end if;
  -- Serializa también un primer envío concurrente, antes de que exista la fila.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing_note from public.crane_delivery_notes where id = p_id for update;
  if found then
    if existing_note.operator_id = auth.uid() and existing_note.submission_data = p_data and existing_note.submission_files = p_files then
      return existing_note.id;
    end if;
    raise exception 'El identificador ya se usó con otros datos' using errcode = '23505';
  end if;
  -- Un reintento histórico se resuelve antes de exigir las reglas de los envíos nuevos.
  perform private.validate_crane_note_input(p_data, p_files);
  if p_data->>'budgetId' is not null then
    raise exception 'Solo Administración puede vincular el remito a un presupuesto' using errcode = '42501';
  end if;
  equipment := private.require_intake_crane((p_data->>'equipmentId')::uuid);
  -- El orden de bloqueo evita interbloqueos si dos formularios contienen los mismos archivos.
  perform 1 from public.crane_delivery_note_uploads where path in
    (select f->>'path' from jsonb_array_elements(p_files) f) order by id for update;
  insert into public.crane_delivery_notes(id, operator_id, equipment_id, equipment_name, number, service_date,
    customer_name, work_description, notes, submission_data, submission_files)
    values(p_id, auth.uid(), equipment.id, equipment.nombre, coalesce(btrim(p_data->>'number'), ''),
      (p_data->>'serviceDate')::date, coalesce(btrim(p_data->>'customerName'), ''),
      coalesce(btrim(p_data->>'workDescription'), ''), coalesce(p_data->>'notes', ''), p_data, p_files);
  for file_entry in select value from jsonb_array_elements(p_files) loop
    select * into ticket from public.crane_delivery_note_uploads where path = file_entry->>'path';
    if not found or ticket.operator_id <> auth.uid() or ticket.equipment_id <> equipment.id
      or ticket.expires_at <= now() or ticket.consumed_note_id is not null then
      raise exception 'La carga no te pertenece, venció o ya se utilizó' using errcode = '42501';
    end if;
    select metadata into object_metadata from storage.objects where bucket_id = 'documentos' and name = ticket.path for share;
    if not found or object_metadata->>'mimetype' is distinct from ticket.mime
      or not pg_input_is_valid(coalesce(object_metadata->>'size', ''), 'bigint') then
      raise exception 'Subí el archivo con el tipo y el tamaño reservados' using errcode = '22023';
    end if;
    if (object_metadata->>'size')::bigint is distinct from ticket.expected_size then
      raise exception 'El tamaño del archivo no coincide con la carga reservada' using errcode = '22023';
    end if;
    position_value := position_value + 1;
    insert into public.crane_delivery_note_files(note_id, upload_id, path, original_name, mime, size, position)
      values(p_id, ticket.id, ticket.path, file_entry->>'originalName', ticket.mime, ticket.expected_size, position_value);
    update public.crane_delivery_note_uploads set consumed_note_id = p_id where id = ticket.id;
  end loop;
  return p_id;
end;
$$;

-- Omitir la grúa no cambia las asignaciones históricas del gruista.
create or replace function public.set_crane_operator_access(p_user_id uuid, p_active boolean, p_equipment_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role text;
begin
  perform private.exigir_usuario_activo();
  if p_active is null then
    raise exception 'Elegí el estado del gruista' using errcode = '22023';
  end if;
  select rol into target_role from public.profiles where id = p_user_id for update;
  if not found or target_role <> 'crane_operator' then
    raise exception 'El usuario no existe o no es un gruista' using errcode = '22023';
  end if;
  if p_equipment_id is not null then
    perform 1 from public.equipos where id = p_equipment_id and activo for share;
    if not found then
      raise exception 'La grúa no existe o está inactiva' using errcode = '22023';
    end if;
  end if;
  update public.profiles set activo = p_active where id = p_user_id;
  if p_equipment_id is not null then
    insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
      values(p_user_id, p_equipment_id, auth.uid())
      on conflict(user_id) do update set equipment_id = excluded.equipment_id,
        assigned_by = excluded.assigned_by, assigned_at = now();
  end if;
end;
$$;

create or replace function public.set_user_access(p_user_id uuid, p_role text, p_active boolean, p_equipment_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.es_admin() then
    raise exception 'Solo un administrador puede gestionar usuarios' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'operador', 'crane_operator') or p_active is null then
    raise exception 'Revisá el rol y el estado del usuario' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'El usuario no existe' using errcode = '22023'; end if;
  if p_role = 'crane_operator' then
    if p_equipment_id is not null then
      perform 1 from public.equipos where id = p_equipment_id and activo for share;
      if not found then raise exception 'La grúa no existe o está inactiva' using errcode = '22023'; end if;
    end if;
  elsif p_equipment_id is not null then
    raise exception 'Solo un gruista puede tener una grúa asignada' using errcode = '22023';
  end if;
  update public.profiles set rol = p_role, activo = p_active where id = p_user_id;
  if p_role = 'crane_operator' and p_equipment_id is not null then
    insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
    values(p_user_id, p_equipment_id, auth.uid())
    on conflict(user_id) do update set equipment_id = excluded.equipment_id,
      assigned_by = excluded.assigned_by, assigned_at = now();
  end if;
end;
$$;

create or replace function public.complete_crane_operator_signup(p_user_id uuid, p_name text, p_equipment_id uuid default null, p_actor_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; target public.profiles; name_value text;
begin
  select * into actor from public.profiles where id = p_actor_id for share;
  if not found or not actor.activo or actor.rol not in ('admin', 'operador') then
    raise exception 'El usuario que solicita el alta no está habilitado' using errcode = '42501';
  end if;
  if p_user_id = p_actor_id then
    raise exception 'El destino del alta tiene que ser una cuenta nueva' using errcode = '22023';
  end if;
  select * into target from public.profiles where id = p_user_id for update;
  if not found or target.activo or target.rol <> 'operador' then
    raise exception 'El destino del alta tiene que ser una cuenta nueva e inactiva' using errcode = '22023';
  end if;
  name_value := btrim(p_name);
  if name_value is null or char_length(name_value) not between 1 and 120 then
    raise exception 'Ingresá un nombre de entre 1 y 120 caracteres' using errcode = '22023';
  end if;
  if p_equipment_id is not null then
    perform 1 from public.equipos where id = p_equipment_id and activo for share;
    if not found then
      raise exception 'La grúa no existe o está inactiva' using errcode = '22023';
    end if;
  end if;
  update public.profiles set nombre = name_value, rol = 'crane_operator', activo = true where id = p_user_id;
  if p_equipment_id is not null then
    insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
      values(p_user_id, p_equipment_id, p_actor_id)
      on conflict(user_id) do update set equipment_id = excluded.equipment_id,
        assigned_by = excluded.assigned_by, assigned_at = now();
  end if;
end;
$$;

revoke all on function public.list_operator_cranes(), public.get_crane_operator_context(),
  public.create_crane_delivery_note_upload(text,bigint,uuid), public.submit_crane_delivery_note(uuid,jsonb,jsonb),
  public.set_crane_operator_access(uuid,boolean,uuid), public.set_user_access(uuid,text,boolean,uuid)
  from public, anon;
grant execute on function public.list_operator_cranes(), public.get_crane_operator_context(),
  public.create_crane_delivery_note_upload(text,bigint,uuid), public.submit_crane_delivery_note(uuid,jsonb,jsonb),
  public.set_crane_operator_access(uuid,boolean,uuid), public.set_user_access(uuid,text,boolean,uuid)
  to authenticated;

revoke all on function private.require_intake_crane(uuid) from public, anon, authenticated;
revoke all on function public.complete_crane_operator_signup(uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_crane_operator_signup(uuid,text,uuid,uuid) to service_role;

commit;
