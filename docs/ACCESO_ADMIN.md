# Acceso administrador con contraseña

El usuario es tu **correo administrador existente**. Entra en `/login`, escribe ese correo y tu contraseña y pulsa **Iniciar sesión**. El acceso ya no pide ni envía un enlace mágico. La interfaz mantiene el español.

El inicio de sesión usa Supabase Auth y sus sesiones habituales. Los roles siguen comprobándose en el servidor y la base de datos; tener una contraseña no concede acceso administrador. La nueva forma de ingreso funciona también con el panel anterior y no requiere instalar la migración de operaciones.

## Si tu cuenta solo usaba enlaces

Primero configura una contraseña para esa misma cuenta. Necesitas un operador con acceso al proyecto y a su clave de servidor. El comando conserva el ID del usuario y sus permisos, confirma el correo de la cuenta administradora autorizada y no envía email.

1. Comprueba en **Supabase → Authentication → Users** que tu correo ya existe. En la configuración de autenticación, el proveedor **Email** debe estar habilitado para correo/contraseña.
2. En una terminal privada del proyecto, usa Node 24 y ejecuta `npm ci` si faltan dependencias.
3. Configura `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno privado o `.env.local`, que está excluido de Git. Si todavía usas el panel anterior, configura también su `ADMIN_EMAILS`. No compartas la clave de servidor ni la contraseña en el chat.
4. Ejecuta, reemplazando el correo:

   ```bash
   npm run admin:set-password -- TU_CORREO_ADMIN
   ```

   En el cloud con proxy usa:

   ```bash
   NODE_USE_ENV_PROXY=1 npm run admin:set-password -- TU_CORREO_ADMIN
   ```

5. Escribe tu contraseña dos veces. La entrada permanece oculta; no se incluye en el comando, el historial o mensajes de salida. El comando exige al menos 12 caracteres y máximo 72 bytes, y Supabase aplica también la política de contraseña del proyecto.
6. Entra en `/login` con ese correo y la contraseña elegida. No hace falta redesplegar por cambiar la contraseña del usuario.

El comando solo actualiza una cuenta existente con rol `owner`, `reviewer` o `stock`. Si la migración no está instalada, exige un correo incluido en `ADMIN_EMAILS`. Si el sistema nuevo está instalado y el rol fue revocado, la lista anterior no vuelve a habilitarlo. El comando no crea cuentas ni asigna permisos.

La clave de servidor solo se necesita para esta configuración privada. El inicio de sesión normal usa la clave pública y no expone credenciales de administrador.

## Si la cuenta no existe

El propietario del proyecto puede crearla en **Authentication → Users → Add user → Create user**, con correo y contraseña y la confirmación correspondiente. Después debe asignar su rol siguiendo [GUIA_ADMIN.md](GUIA_ADMIN.md), o autorizar el correo en el panel anterior si la migración sigue pendiente. No hay registro público desde la pantalla de login.

## Si olvidaste la contraseña

Solicita al operador que repita `admin:set-password` para tu cuenta. Esta recuperación no depende de emails ni enlaces. Una contraseña incorrecta muestra un error y permite reintentar; los límites de intentos siguen gestionados por Supabase.
