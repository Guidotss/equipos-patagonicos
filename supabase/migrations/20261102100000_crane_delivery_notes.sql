-- Los partes de campo no necesitan inventar clientes ni presupuestos comerciales.
create table public.crane_delivery_notes (
  id uuid primary key,
  operator_id uuid not null references public.profiles(id),
  equipment_id uuid not null references public.equipos(id),
  equipment_name text not null,
  status text not null default 'pending' check (status in ('pending', 'linked')),
  number text not null default '' check (char_length(number) <= 100),
  service_date date not null,
  customer_name text not null check (btrim(customer_name) <> '' and char_length(customer_name) <= 2000),
  work_description text not null check (btrim(work_description) <> '' and char_length(work_description) <= 2000),
  notes text not null default '' check (char_length(notes) <= 2000),
  requested_budget_id uuid references public.cotizaciones(id),
  document_id uuid unique references public.documentos(id),
  -- El destino original conserva la idempotencia aunque el personal cambie los vínculos del documento.
  linked_budget_id uuid references public.cotizaciones(id),
  linked_by uuid references public.profiles(id) on delete set null,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  submission_data jsonb not null,
  submission_files jsonb not null,
  constraint crane_note_link_state check (
    (status = 'pending' and document_id is null and linked_budget_id is null and linked_by is null and linked_at is null)
    or (status = 'linked' and document_id is not null and linked_budget_id is not null and linked_at is not null)
  )
);
create index crane_delivery_notes_owner_date on public.crane_delivery_notes(operator_id, service_date desc, created_at desc);
create index crane_delivery_notes_pending_date on public.crane_delivery_notes(created_at desc) where status = 'pending';

create table public.crane_delivery_note_uploads (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  equipment_id uuid not null references public.equipos(id),
  path text not null unique,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  expected_size bigint not null check (expected_size between 1 and 10485760),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day'),
  consumed_note_id uuid references public.crane_delivery_notes(id) on delete set null,
  constraint crane_upload_path check (path = 'documentos/crane-operators/' || operator_id::text || '/' || id::text ||
    case mime when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' end)
);
create index crane_delivery_note_uploads_owner on public.crane_delivery_note_uploads(operator_id, created_at desc);
create index crane_delivery_note_uploads_expiry on public.crane_delivery_note_uploads(expires_at) where consumed_note_id is null;

create table public.crane_delivery_note_files (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.crane_delivery_notes(id) on delete cascade,
  upload_id uuid not null unique references public.crane_delivery_note_uploads(id),
  path text not null unique,
  original_name text not null check (btrim(original_name) <> '' and char_length(original_name) <= 255),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size bigint not null check (size between 1 and 10485760),
  position integer not null check (position between 1 and 50),
  unique(note_id, position)
);

alter table public.crane_delivery_notes enable row level security;
alter table public.crane_delivery_note_uploads enable row level security;
alter table public.crane_delivery_note_files enable row level security;
grant select on public.crane_delivery_notes, public.crane_delivery_note_uploads, public.crane_delivery_note_files to authenticated;
create policy crane_note_visibility on public.crane_delivery_notes for select to authenticated
  using ((select private.is_staff()) or (operator_id = (select auth.uid()) and (select private.is_crane_operator())));
create policy crane_upload_visibility on public.crane_delivery_note_uploads for select to authenticated
  using ((select private.is_staff()) or (operator_id = (select auth.uid()) and (select private.is_crane_operator())));
create policy crane_file_visibility on public.crane_delivery_note_files for select to authenticated
  using ((select private.is_staff()) or exists (select 1 from public.crane_delivery_notes n
    where n.id = note_id and n.operator_id = (select auth.uid()) and (select private.is_crane_operator())));

-- El registro de cargas autoriza la ruta; los uploads firmados no garantizan owner_id en Storage.
create function private.can_read_crane_file(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_crane_operator() and exists (select 1 from public.crane_delivery_note_uploads
    where operator_id = auth.uid() and path = p_path);
$$;
create function private.can_upload_crane_file(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  -- La firma conserva upsert durante dos horas; no se concede aunque el objeto todavía no exista.
  select private.is_crane_operator()
    and coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-upsert', 'false') = 'false'
    and exists (
    select 1 from public.crane_delivery_note_uploads u
    join public.crane_operator_assignments a on a.user_id = u.operator_id and a.equipment_id = u.equipment_id
    join public.equipos e on e.id = a.equipment_id and e.activo
    where u.operator_id = auth.uid() and u.path = p_path and u.expires_at > now() and u.consumed_note_id is null
  );
$$;
grant execute on function private.can_read_crane_file(text), private.can_upload_crane_file(text) to authenticated;
create policy crane_storage_read on storage.objects as restrictive for select to authenticated
  using (bucket_id = 'documentos' and ((select private.is_staff()) or private.can_read_crane_file(name)));
create policy crane_storage_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id = 'documentos' and ((select private.is_staff()) or private.can_upload_crane_file(name)));

create function public.create_crane_delivery_note_upload(p_mime text, p_size bigint)
returns table(upload_id uuid, path text) language plpgsql security definer set search_path = '' as $$
declare equipment public.equipos; upload_id_value uuid := gen_random_uuid(); path_value text;
begin
  equipment := private.require_current_crane();
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

create function private.validate_crane_note_input(p_data jsonb, p_files jsonb)
returns void language plpgsql set search_path = '' as $$
declare key_name text; file_entry jsonb;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Los datos del remito tienen que ser un objeto' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_data) k where k not in
    ('budgetId', 'number', 'serviceDate', 'customerName', 'workDescription', 'notes')) then
    raise exception 'El remito contiene campos no permitidos' using errcode = '22023';
  end if;
  foreach key_name in array array['number', 'customerName', 'workDescription', 'notes', 'serviceDate', 'budgetId'] loop
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
  if length(coalesce(p_data->>'number', '')) > 100
    or length(coalesce(p_data->>'notes', '')) > 2000
    or length(coalesce(p_data->>'customerName', '')) > 2000
    or length(coalesce(p_data->>'workDescription', '')) not between 1 and 2000
    or btrim(p_data->>'workDescription') = ''
    or (p_data->>'budgetId' is null and coalesce(btrim(p_data->>'customerName'), '') = '') then
    raise exception 'Revisá el cliente, el trabajo realizado y los límites de texto' using errcode = '22023';
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

-- Solo este finalizador convierte archivos verificados en adjuntos comerciales, conservando su ruta original.
create function private.finalize_crane_delivery_note(p_note_id uuid, p_budget_id uuid, p_linked_by uuid)
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
      concat_ws(E'\n', 'Cliente informado: ' || note.customer_name, 'Trabajo realizado: ' || note.work_description,
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

create function public.submit_crane_delivery_note(p_id uuid, p_data jsonb, p_files jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  equipment public.equipos; existing_note public.crane_delivery_notes; budget public.cotizaciones;
  ticket public.crane_delivery_note_uploads; object_metadata jsonb; file_entry jsonb;
  customer_name_value text; position_value integer := 0;
begin
  perform private.require_crane_operator();
  if p_id is null then raise exception 'El identificador del remito no es válido' using errcode = '22023'; end if;
  perform private.validate_crane_note_input(p_data, p_files);
  -- Serializa también un primer envío concurrente, antes de que exista la fila.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing_note from public.crane_delivery_notes where id = p_id for update;
  if found then
    if existing_note.operator_id = auth.uid() and existing_note.submission_data = p_data and existing_note.submission_files = p_files then
      return existing_note.id;
    end if;
    raise exception 'El identificador ya se usó con otros datos' using errcode = '23505';
  end if;
  equipment := private.require_current_crane();
  if p_data->>'budgetId' is not null then
    select * into budget from public.cotizaciones where id = (p_data->>'budgetId')::uuid for share;
    if not found or budget.equipo_id is distinct from equipment.id or budget.estado <> 'aprobada' or budget.presupuesto_estado <> 'en_curso' then
      raise exception 'El presupuesto no está disponible para tu grúa' using errcode = '42501';
    end if;
    select razon_social into customer_name_value from public.clientes where id = budget.cliente_id;
  else
    customer_name_value := btrim(p_data->>'customerName');
  end if;
  -- El orden de bloqueo evita interbloqueos si dos formularios contienen los mismos archivos.
  perform 1 from public.crane_delivery_note_uploads where path in
    (select f->>'path' from jsonb_array_elements(p_files) f) order by id for update;
  insert into public.crane_delivery_notes(id, operator_id, equipment_id, equipment_name, number, service_date,
    customer_name, work_description, notes, requested_budget_id, submission_data, submission_files)
    values(p_id, auth.uid(), equipment.id, equipment.nombre, coalesce(btrim(p_data->>'number'), ''),
      (p_data->>'serviceDate')::date, customer_name_value, btrim(p_data->>'workDescription'),
      coalesce(p_data->>'notes', ''), budget.id, p_data, p_files);
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
  if budget.id is not null then perform private.finalize_crane_delivery_note(p_id, budget.id, auth.uid()); end if;
  return p_id;
end;
$$;

create function public.link_crane_delivery_note(p_note_id uuid, p_budget_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.exigir_usuario_activo();
  return private.finalize_crane_delivery_note(p_note_id, p_budget_id, auth.uid());
end;
$$;

grant execute on function public.create_crane_delivery_note_upload(text,bigint),
  public.submit_crane_delivery_note(uuid,jsonb,jsonb), public.link_crane_delivery_note(uuid,uuid) to authenticated;
