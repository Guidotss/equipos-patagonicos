create function private.require_current_crane()
returns public.equipos language plpgsql security definer set search_path = '' as $$
declare equipment public.equipos;
begin
  perform 1 from public.profiles where id = auth.uid() for share;
  perform private.require_crane_operator();
  select e.* into equipment from public.crane_operator_assignments a
    join public.equipos e on e.id = a.equipment_id
    where a.user_id = auth.uid() and e.activo for share of a, e;
  if not found then raise exception 'No tenés una grúa activa asignada' using errcode = '42501'; end if;
  return equipment;
end;
$$;
