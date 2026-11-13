create or replace function private.avanzar_numeracion(p_numero bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secuencia text := pg_get_serial_sequence('public.cotizaciones', 'numero');
  v_ultimo bigint;
  v_llamada boolean;
  v_proximo bigint;
begin
  execute format('select last_value, is_called from %s', v_secuencia) into v_ultimo, v_llamada;
  v_proximo := case when v_llamada then v_ultimo + 1 else v_ultimo end;
  if p_numero > v_proximo + 1000 then
    raise exception 'El número % está muy por encima del próximo (%); revisalo', p_numero, v_proximo
      using errcode = 'P0001';
  end if;
  if p_numero >= v_proximo then
    perform setval(v_secuencia, p_numero, true);
  end if;
end;
$$;
