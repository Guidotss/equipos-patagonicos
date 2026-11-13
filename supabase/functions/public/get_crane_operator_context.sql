-- Consulta el contexto de trabajo de un gruista.
create or replace function public.get_crane_operator_context() returns jsonb language plpgsql stable security definer
set search_path = '' as $$
declare equipment public.equipos;
begin perform private.require_crane_operator();
select e.* into equipment
from public.crane_operator_assignments a
  join public.equipos e on e.id = a.equipment_id
where a.user_id = auth.uid();
return jsonb_build_object(
  'equipment',
  case
    when equipment.id is null then null
    else jsonb_build_object(
      'id',
      equipment.id,
      'name',
      equipment.nombre,
      'active',
      equipment.activo
    )
  end,
  'jobs',
  '[]'::jsonb
);
end;
$$;