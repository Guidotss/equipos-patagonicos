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
