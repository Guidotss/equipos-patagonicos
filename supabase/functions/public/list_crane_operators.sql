-- Lista gruistas y sus accesos.
create function public.list_crane_operators(
  p_search text default '',
  p_active boolean default null
) returns table(
  user_id uuid,
  name text,
  email text,
  active boolean,
  equipment_id uuid,
  equipment_name text,
  equipment_active boolean,
  note_count bigint,
  pending_note_count bigint,
  last_submission_at timestamptz
) language plpgsql stable security definer
set search_path = '' as $$
declare search_value text;
begin perform private.exigir_usuario_activo();
search_value := btrim(coalesce(p_search, ''));
if char_length(search_value) > 200 then raise exception 'La búsqueda puede tener hasta 200 caracteres' using errcode = '22023';
end if;
return query
select p.id,
  p.nombre,
  u.email::text,
  p.activo,
  a.equipment_id,
  e.nombre,
  e.activo,
  activity.note_count,
  activity.pending_note_count,
  activity.last_submission_at
from public.profiles p
  join auth.users u on u.id = p.id
  left join public.crane_operator_assignments a on a.user_id = p.id
  left join public.equipos e on e.id = a.equipment_id
  left join lateral (
    select count(*) as note_count,
      count(*) filter (
        where n.status = 'pending'
      ) as pending_note_count,
      max(n.created_at) as last_submission_at
    from public.crane_delivery_notes n
    where n.operator_id = p.id
  ) activity on true
where p.rol = 'crane_operator'
  and (
    p_active is null
    or p.activo = p_active
  )
  and (
    search_value = ''
    or p.nombre ilike '%' || search_value || '%'
    or u.email ilike '%' || search_value || '%'
    or e.nombre ilike '%' || search_value || '%'
  )
order by p.nombre,
  p.id;
end;
$$;