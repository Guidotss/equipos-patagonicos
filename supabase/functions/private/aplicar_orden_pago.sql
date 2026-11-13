create or replace function private.aplicar_orden_pago(p_op_id uuid, p_cliente_id uuid, p_monto_op numeric, p_aplicaciones jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(p_aplicaciones) is distinct from 'array' or jsonb_array_length(p_aplicaciones) > 0 then
    raise exception 'Las aplicaciones se guardan junto con los medios en finance.paymentAllocations' using errcode = 'P0001'; end if;
  perform private.synchronize_payment_projection(p_op_id);
end;
$$;
