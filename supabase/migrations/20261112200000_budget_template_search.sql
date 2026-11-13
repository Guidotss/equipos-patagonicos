-- La búsqueda incluye los valores que se muestran al completar el asunto de una plantilla.
create or replace function public.buscar_presupuestos(texto text default '', estado text default '', cliente uuid default null)
returns setof public.v_presupuestos language sql stable security invoker set search_path = '' as $$
  select p.* from public.v_presupuestos p
  join public.cotizaciones c on c.id = p.id
  left join public.equipos e on e.id = c.equipo_id
  left join public.empresa_config company on company.id = true
  where (coalesce($2, '') = '' or p.display_status = $2)
    and ($3 is null or p.cliente_id = $3)
    and (coalesce($1, '') = '' or extensions.unaccent(lower(concat_ws(' ',
      p.cliente_razon_social, p.asunto, p.numero::text,
      case when p.origen = 'app' then concat_ws(' ',
        case when p.asunto ~ '\{\{\s*capacidad\s*\}\}' and e.capacidad_tn is not null
          then replace(trim(trailing '.' from trim(trailing '0' from e.capacidad_tn::text)), '.', ',') || ' TN' end,
        case when p.asunto ~ '\{\{\s*equipo_descripcion\s*\}\}' then e.descripcion end,
        case when p.asunto ~ '\{\{\s*ubicacion\s*\}\}' then c.datos ->> 'ubicacion' end,
        case when p.asunto ~ '\{\{\s*horario\s*\}\}' then c.datos ->> 'horario' end,
        case when p.asunto ~ '\{\{\s*plazo_entrega\s*\}\}' then c.datos ->> 'plazo_entrega' end,
        case when p.asunto ~ '\{\{\s*duracion_estimada\s*\}\}' then c.datos ->> 'duracion_estimada' end,
        case when p.asunto ~ '\{\{\s*forma_pago\s*\}\}' then c.datos ->> 'forma_pago' end,
        case when p.asunto ~ '\{\{\s*disponibilidad\s*\}\}' then c.datos ->> 'disponibilidad' end,
        case when p.asunto ~ '\{\{\s*validez_dias\s*\}\}' then c.validez_dias::text end,
        case when p.asunto ~ '\{\{\s*indice_base\s*\}\}'
          then coalesce(nullif(c.datos ->> 'indice_base', ''), company.indice_base) end,
        case when p.asunto ~ '\{\{\s*proxima_actualizacion\s*\}\}'
          then coalesce(nullif(c.datos ->> 'proxima_actualizacion', ''), company.proxima_actualizacion) end
      ) end
    ))) like '%' || replace(replace(replace(extensions.unaccent(lower($1)), '\', '\\'), '%', '\%'), '_', '\_') || '%');
$$;
