// Crea un usuario activo. Uso:
// npm run user:create -- --email guido@ejemplo.com --password 'xxxxxx' --name 'Guido Olguín' [--role admin|operador|crane_operator] [--equipment-id UUID]
// Para producción: node --env-file=.env.production.local scripts/create-user.mjs ...
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

class CreateUserError extends Error {}

function resolveAlias(values, canonical, legacy) {
  const current = values[canonical]?.trim();
  const previous = values[legacy]?.trim();
  if (current !== undefined && previous !== undefined && current !== previous) {
    throw new CreateUserError(`--${canonical} y --${legacy} tienen valores diferentes`);
  }
  return current ?? previous;
}

function readOptions(args) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        email: { type: 'string' }, password: { type: 'string' },
        name: { type: 'string' }, nombre: { type: 'string' },
        role: { type: 'string' }, rol: { type: 'string' },
        'equipment-id': { type: 'string' },
      },
    }));
  } catch {
    throw new CreateUserError('Revisá los argumentos. Uso: npm run user:create -- --email EMAIL --password CONTRASEÑA --name NOMBRE [--role admin|operador|crane_operator] [--equipment-id UUID]');
  }
  const name = resolveAlias(values, 'name', 'nombre');
  const role = resolveAlias(values, 'role', 'rol') ?? 'admin';
  const email = values.email?.trim();
  const password = values.password;
  const equipmentId = values['equipment-id']?.trim();
  if (!name || !email || !password?.trim()) {
    throw new CreateUserError('Faltan datos: --email, --password y --name son obligatorios (--nombre también es válido)');
  }
  if (!z.email().safeParse(email).success) throw new CreateUserError('El email no es válido');
  if (password.length < 6) throw new CreateUserError('La contraseña tiene que tener al menos 6 caracteres');
  if (!['admin', 'operador', 'crane_operator'].includes(role)) {
    throw new CreateUserError('--role tiene que ser admin, operador o crane_operator');
  }
  if (equipmentId !== undefined && !z.uuid().safeParse(equipmentId).success) {
    throw new CreateUserError('--equipment-id tiene que ser un UUID válido');
  }
  if (role !== 'crane_operator' && equipmentId !== undefined) {
    throw new CreateUserError('Solo un gruista puede tener una grúa asignada');
  }
  return { email, password, name, role, equipmentId };
}

function createAdminClient(env, fetch) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey || !z.url({ protocol: /^https?$/ }).safeParse(url).success) {
    throw new CreateUserError('Revisá NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en el entorno');
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

async function requireActiveEquipment(admin, equipmentId) {
  const { data, error } = await admin.from('equipos').select('id, activo').eq('id', equipmentId).maybeSingle();
  if (error) throw new CreateUserError('No se pudo verificar la grúa. No se creó ningún usuario');
  if (!data?.activo) throw new CreateUserError('La grúa no existe o está inactiva. No se creó ningún usuario');
}

async function activateUser(admin, userId, { name, role, equipmentId }) {
  const { data: profile, error: profileError } = await admin.from('profiles')
    .update({ nombre: name, rol: role, activo: false }).eq('id', userId).select('id').single();
  if (profileError || profile?.id !== userId) throw new CreateUserError('No se pudo configurar el perfil del usuario');
  if (equipmentId) {
    const { error } = await admin.from('crane_operator_assignments').insert({ user_id: userId, equipment_id: equipmentId });
    if (error) throw new CreateUserError('No se pudo asignar la grúa al usuario');
  }
  // La cuenta se habilita al terminar de configurar el perfil y, si se pidió, la asignación legada.
  const { data: activatedProfile, error } = await admin.from('profiles').update({ activo: true }).eq('id', userId).select('id').single();
  if (error || activatedProfile?.id !== userId) throw new CreateUserError('No se pudo activar el usuario');
}

async function removeNewUser(admin, userId) {
  try {
    // La eliminación en Auth borra también el perfil y su asignación por cascada.
    const { error } = await admin.auth.admin.deleteUser(userId);
    return !error;
  } catch {
    return false;
  }
}

/** Las dependencias explícitas permiten probar todos los pedidos sin red ni claves del entorno. */
export async function main(args = process.argv.slice(2), {
  env = process.env,
  fetch = globalThis.fetch,
  log = console.log,
  error: reportError = console.error,
} = {}) {
  let admin;
  let userId;
  try {
    const options = readOptions(args);
    admin = createAdminClient(env, fetch);
    if (options.equipmentId) await requireActiveEquipment(admin, options.equipmentId);
    const { data, error } = await admin.auth.admin.createUser({
      email: options.email, password: options.password, email_confirm: true,
      user_metadata: { nombre: options.name },
    });
    if (error || !data.user?.id) {
      throw new CreateUserError('No se pudo crear el usuario. Revisá el email y la política de contraseñas');
    }
    userId = data.user.id;
    await activateUser(admin, userId, options);
    log(`Usuario ${options.email} creado y activo con rol ${options.role}`);
    return 0;
  } catch (error) {
    reportError(error instanceof CreateUserError ? error.message : 'No se pudo completar el alta del usuario');
    if (userId) {
      if (await removeNewUser(admin, userId)) {
        reportError('Se eliminó el usuario recién creado junto con su perfil y asignación');
      } else {
        reportError(`No se pudo completar la limpieza. Usuario pendiente de revisión: ${userId}`);
      }
    }
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
