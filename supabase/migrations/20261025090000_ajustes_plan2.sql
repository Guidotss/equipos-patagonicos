-- supabase/migrations/20261025090000_ajustes_plan2.sql
-- Clientes: la app no escribe id, created_by ni created_at. Contactos: no se mueven de cliente.

revoke insert, update on public.clientes from authenticated;
grant insert (razon_social, cuit, condicion_iva, direccion, localidad, provincia, telefono, email, condicion_pago, notas)
  on public.clientes to authenticated;
grant update (razon_social, cuit, condicion_iva, direccion, localidad, provincia, telefono, email, condicion_pago, notas, activo)
  on public.clientes to authenticated;

revoke update on public.contactos from authenticated;
grant update (nombre, cargo, email, telefono) on public.contactos to authenticated;
