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
