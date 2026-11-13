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
