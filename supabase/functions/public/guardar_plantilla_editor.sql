-- Guarda una plantilla editada.
create or replace function public.guardar_plantilla_editor(
    p_nombre text,
    p_contenido jsonb,
    p_id uuid default null
  ) returns uuid language plpgsql security definer
set search_path = '' as $$
declare v_id uuid;
v_validez integer;
v_items jsonb;
v_bloques jsonb;
begin perform private.exigir_usuario_activo();
if p_nombre is null
or length(btrim(p_nombre)) not between 1 and 100 then raise exception 'Ingresá un nombre de hasta 100 caracteres' using errcode = 'P0001';
end if;
if p_contenido is null
or coalesce(p_contenido->>'formato', '') not in ('mensual', 'jornada')
or jsonb_typeof(p_contenido->'items') is distinct
from 'array'
  or jsonb_typeof(p_contenido->'bloques') is distinct
from 'array' then raise exception 'El contenido de la plantilla no es válido' using errcode = 'P0001';
end if;
v_validez := (p_contenido->>'validez_dias')::integer;
if v_validez is null
or v_validez not between 1 and 365
or jsonb_array_length(p_contenido->'items') > 200
or jsonb_array_length(p_contenido->'bloques') > 100 then raise exception 'Revisá los ítems y la validez' using errcode = 'P0001';
end if;
if exists (
  select 1
  from jsonb_array_elements(p_contenido->'items') i
  where (
      i ? 'is_complimentary'
      and jsonb_typeof(i->'is_complimentary') is distinct
      from 'boolean'
    )
    or jsonb_typeof(i->'descripcion') is distinct
  from 'string'
    or btrim(i->>'descripcion') = ''
    or jsonb_typeof(i->'seccion') is distinct
  from 'string'
    or coalesce(i->>'unidad', '') not in ('UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE')
    or case
      when jsonb_typeof(i->'cantidad') = 'number' then (i->>'cantidad')::numeric <= 0
      else true
    end
)
or exists (
  select 1
  from jsonb_array_elements(p_contenido->'bloques') b
  where jsonb_typeof(b->'titulo') is distinct
  from 'string'
    or jsonb_typeof(b->'contenido') is distinct
  from 'string'
    or (
      b ? 'hidden'
      and jsonb_typeof(b->'hidden') is distinct
      from 'boolean'
    )
    or (
      b ? 'oculto'
      and jsonb_typeof(b->'oculto') is distinct
      from 'boolean'
    )
) then raise exception 'Los ítems o textos de la plantilla no son válidos' using errcode = 'P0001';
end if;
select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seccion',
        i->>'seccion',
        'descripcion',
        i->>'descripcion',
        'cantidad',
(i->>'cantidad')::numeric,
        'unidad',
        i->>'unidad',
        'is_complimentary',
        coalesce((i->>'is_complimentary')::boolean, false)
      )
    ),
    '[]'::jsonb
  ) into v_items
from jsonb_array_elements(p_contenido->'items') i;
select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'titulo',
        b->>'titulo',
        'contenido',
        b->>'contenido',
        'oculto',
        coalesce(
          (b->>'hidden')::boolean,
(b->>'oculto')::boolean,
          false
        )
      )
    ),
    '[]'::jsonb
  ) into v_bloques
from jsonb_array_elements(p_contenido->'bloques') b;
if p_id is null then
insert into public.plantillas(
    nombre,
    formato,
    asunto,
    intro,
    validez_dias,
    items,
    bloques
  )
values(
    btrim(p_nombre),
    p_contenido->>'formato',
    coalesce(p_contenido->>'asunto', ''),
    coalesce(p_contenido->>'intro', ''),
    v_validez,
    v_items,
    v_bloques
  )
returning id into v_id;
else
update public.plantillas
set nombre = btrim(p_nombre),
  formato = p_contenido->>'formato',
  asunto = coalesce(p_contenido->>'asunto', ''),
  intro = coalesce(p_contenido->>'intro', ''),
  validez_dias = v_validez,
  items = v_items,
  bloques = v_bloques
where id = p_id
returning id into v_id;
if not found then raise exception 'La plantilla no existe' using errcode = 'P0001';
end if;
end if;
return v_id;
exception
when unique_violation then raise exception 'Ya existe una plantilla con ese nombre' using errcode = 'P0001';
end;
$$;