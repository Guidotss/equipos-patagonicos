create or replace function private.leer_datos_documento(p_datos jsonb)
returns public.documentos
language sql
stable
set search_path = ''
as $$
  select jsonb_populate_record(null::public.documentos, coalesce(jsonb_object_agg(e.key, e.value), '{}'))
  from jsonb_each(p_datos) as e
  where e.key in ('cliente_id', 'tipo', 'numero', 'fecha', 'monto', 'tipo_comprobante', 'fecha_vencimiento',
                  'numero_oc_ref', 'periodo_desde', 'periodo_hasta', 'equipo_id', 'notas')
    and not (e.key in ('fecha', 'fecha_vencimiento', 'periodo_desde', 'periodo_hasta', 'equipo_id') and e.value = '""');
$$;
