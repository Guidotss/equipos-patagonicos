create or replace function private.derive_document_equipment(p_budget_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  equipment_ids uuid[];
begin
  -- Mantiene estable el equipo mientras se registra o convierte el documento.
  perform 1 from public.cotizaciones where id = any(p_budget_ids) order by id for share;
  equipment_ids := array(
    select distinct c.equipo_id from public.cotizaciones c where c.id = any(p_budget_ids)
  );
  -- DISTINCT conserva el nulo: mezclar un presupuesto sin equipo con otro asignado también es ambiguo.
  if cardinality(equipment_ids) > 1 then
    raise exception 'Los presupuestos seleccionados tienen equipos diferentes. Creá remitos separados para cada equipo y para los presupuestos sin equipo asignado.'
      using errcode = 'P0001';
  end if;
  return equipment_ids[1];
end;
$$;
