begin;

create or replace function public.save_delivery_note_with_invoice(
  p_datos jsonb,
  p_presupuestos uuid[],
  p_archivos jsonb,
  p_factura_id uuid default null,
  p_id uuid default null,
  p_quitar uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_id uuid;
  delivery_note_id uuid := p_id;
  current_invoice_id uuid;
  invoice_to_validate uuid := p_factura_id;
  current_budget_ids uuid[];
begin
  perform private.exigir_usuario_activo();

  if p_datos ->> 'tipo' is distinct from 'remito' then
    raise exception 'El documento tiene que ser un remito' using errcode = 'P0001';
  end if;
  if p_datos ->> 'cliente_id' is null then
    raise exception 'Falta el cliente' using errcode = 'P0001';
  end if;
  if not pg_input_is_valid(p_datos ->> 'cliente_id', 'uuid') then
    raise exception 'Cliente inválido' using errcode = 'P0001';
  end if;
  if p_datos ? 'finance' then
    raise exception 'El remito no admite datos financieros' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_presupuestos), 0) = 0 then
    raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
  end if;

  client_id := (p_datos ->> 'cliente_id')::uuid;
  perform private.lock_financial_client(client_id);
  perform private.lock_financial_rows(client_id);

  if delivery_note_id is not null then
    select r.factura_id into current_invoice_id
    from public.documentos r
    where r.id = delivery_note_id and r.cliente_id = client_id and r.tipo = 'remito' and r.deleted_at is null;

    if not found then
      raise exception 'El remito no existe, está anulado o es de otro cliente' using errcode = 'P0001';
    end if;
    if current_invoice_id is not null and exists (
      select 1 from public.documentos f where f.id = current_invoice_id and f.deleted_at is null
    ) then
      if p_factura_id is not null and current_invoice_id <> p_factura_id then
        raise exception 'El remito ya está cubierto por otra factura vigente' using errcode = 'P0001';
      end if;
      if p_factura_id is null then
        -- Consultar el vínculo actual bajo el bloqueo; un formulario abierto puede estar desactualizado.
        current_budget_ids := array(select cotizacion_id from public.documento_presupuestos where documento_id = delivery_note_id);
        if not (p_presupuestos @> current_budget_ids and p_presupuestos <@ current_budget_ids) then
          invoice_to_validate := current_invoice_id;
        end if;
      end if;
    end if;
  elsif p_factura_id is null then
    raise exception 'Elegí una factura vigente del mismo cliente' using errcode = 'P0001';
  end if;

  if invoice_to_validate is not null and not exists (
    select 1 from public.documentos f
    where f.id = invoice_to_validate and f.cliente_id = client_id and f.tipo = 'factura'
      and f.tipo_comprobante <> 'NC' and f.deleted_at is null
  ) then
    raise exception 'Elegí una factura vigente del mismo cliente' using errcode = 'P0001';
  end if;
  if invoice_to_validate is not null and exists (
    select 1 from unnest(p_presupuestos) as selected(budget_id)
    where not exists (
      select 1 from public.documento_presupuestos dp
      where dp.documento_id = invoice_to_validate and dp.cotizacion_id = selected.budget_id
    )
  ) then
    raise exception 'La factura tiene que incluir todos los presupuestos seleccionados' using errcode = 'P0001';
  end if;

  if delivery_note_id is null then
    delivery_note_id := public.registrar_documento(p_datos, p_presupuestos, p_archivos);
  else
    perform public.actualizar_documento_con_archivos(
      p_id => delivery_note_id,
      p_datos => p_datos,
      p_presupuestos => p_presupuestos,
      p_archivos => p_archivos,
      p_quitar => p_quitar
    );
  end if;

  if p_factura_id is not null then
    update public.documentos set factura_id = p_factura_id
    where id = delivery_note_id and factura_id is distinct from p_factura_id;
  end if;

  return delivery_note_id;
end;
$$;

revoke all on function public.save_delivery_note_with_invoice(jsonb, uuid[], jsonb, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.save_delivery_note_with_invoice(jsonb, uuid[], jsonb, uuid, uuid, uuid[]) to authenticated;

commit;
