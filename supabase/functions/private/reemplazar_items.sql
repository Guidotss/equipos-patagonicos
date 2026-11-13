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
