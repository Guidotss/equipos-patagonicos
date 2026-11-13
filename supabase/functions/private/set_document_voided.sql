create function private.set_document_voided(document_id uuid, expected_version bigint, reason text, voided boolean)
returns void language plpgsql set search_path = '' as $$
declare document public.documentos%rowtype; previous jsonb;
begin
  perform private.exigir_usuario_activo();
  select * into document from public.documentos where id = document_id;
  perform private.lock_financial_client(document.cliente_id);
  perform private.lock_financial_rows(document.cliente_id);
  select * into document from public.documentos where id = document_id;
  if document.id is null or (document.deleted_at is not null) = voided then
    raise exception 'El documento no existe o ya tiene ese estado' using errcode = 'P0001'; end if;
  if document.tipo in ('factura', 'orden_pago') then
    perform private.require_financial_version(document.financial_version, to_jsonb(expected_version));
    if coalesce(btrim(reason), '') = '' then raise exception 'Indicá el motivo del cambio financiero' using errcode = 'P0001'; end if;
  end if;
  if char_length(reason) > 2000 then raise exception 'El motivo puede tener hasta 2000 caracteres' using errcode = 'P0001'; end if;
  previous := private.financial_snapshot(document_id);
  update public.documentos set deleted_at = case when voided then now() end,
    deleted_by = case when voided then auth.uid() end where id = document_id;
  perform private.validate_payment_destination_changes(document_id, previous);
  perform private.validate_financial_client(document.cliente_id);
  if document.tipo in ('factura', 'orden_pago') then
    perform private.append_financial_event(document_id, previous, case when voided then 'voided' else 'restored' end, reason);
  end if;
end;
$$;
