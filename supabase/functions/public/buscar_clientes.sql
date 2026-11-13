-- Busca clientes para listados y selecciones.
create or replace function public.buscar_clientes(texto text default '', limite integer default 50) returns setof public.clientes language sql stable security invoker
set search_path = '' as $$ with consulta as (
    select extensions.unaccent(lower(btrim(coalesce(texto, '')))) as normalizado,
      regexp_replace(coalesce(texto, ''), '\D', '', 'g') as digitos
  ),
  patron as (
    select normalizado,
      digitos,
      '%' || replace(
        replace(
          replace(
            normalizado,
            '\', ' \ \ '), ' %', ' \ %'), ' _ ', ' \ _ ') || ' %' as como
    from consulta
  )
  select c.*
  from public.clientes c, patron p
  where p.normalizado = ''
     or extensions.unaccent(lower(c.razon_social)) like p.como
     or (length(p.digitos) >= 3 and c.cuit like ' %' || p.digitos || ' %')
     or exists (
       select 1 from public.contactos k
       where k.cliente_id = c.id and extensions.unaccent(lower(k.nombre)) like p.como
     )
  order by c.activo desc, c.razon_social
  limit least(greatest(coalesce(limite, 50), 1), 200);
$$;