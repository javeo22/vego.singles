# Comprobaciones de la entrega

Fecha: 4 de octubre de 2026. Estas comprobaciones corresponden al código de esta entrega; no acreditan que la migración esté instalada en producción.

## Resultados

- Instalación reproducible: `npm ci --cache /tmp/vego-npm-cache --no-audit --no-fund` completada con el lockfile.
- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado, con lint y TypeScript integrados.
- `npm test`: **43 pruebas aprobadas**, sin omisiones.

Servidor compilado: `/` y `/login` respondieron 200, la tienda utilizó los listados públicos reales y `/admin` redirigió a login. Las APIs privadas rechazaron sesiones ausentes; solicitudes sin origen o con origen externo devolvieron 403. Una solicitud válida desde el mismo sitio devolvió 503 por falta de la clave de servidor, como corresponde al estado de instalación. La configuración pública devolvió registro de solicitudes deshabilitado y tarifa pendiente, conservando el flujo directo por WhatsApp.

Las pruebas ejecutan las migraciones en PostgreSQL mediante PGlite. Verifican permisos públicos/privados, roles, reintentos, recepción duplicada, referencias distintas, reconciliación y snapshots desactualizados, costos por lote, salidas repartidas entre lotes, traslado, precios SQL/TypeScript, evidencia vencida, bloqueo, aprobación en lote atómica, cotización desde servidor, reservas de última copia, venta única, recuperación de trabajadores y rechazo de turnos vencidos. Una prueba adicional actualiza un esquema con disponibilidad booleana y campos de vitrina, conservando precio y publicación.

Las pruebas DOM verifican paginación más allá de cien registros, formularios con reintento, idioma japonés/número completo, errores de revisión, vitrina por precio, carrito y mensaje WhatsApp con totales del servidor. La validación de origen rechaza solicitudes externas y comprueba la dirección del navegador bajo proxy. Los adaptadores Scryfall/Pokémon/TCGdex se comprueban con respuestas de ejemplo; no se certifica su acceso real.

## Estado del proyecto real

La lectura pública del proyecto Supabase devolvió 289 listados. Su campo `available` es booleano y no representa cantidad de copias. La aplicación conserva esa distinción y usa la vista anterior hasta que se instale la actualización. Ningún inventario, precio, identidad o reserva real se modificó durante estas comprobaciones.

No se dispone de clave de servidor, conexión SQL ni sesión de administrador en este entorno. La migración y los flujos autenticados deben verificarse en una copia del proyecto antes de activarlos siguiendo [GUIA_ADMIN.md](GUIA_ADMIN.md). No vuelvas a ejecutar el seed existente.

## Comprobaciones pendientes de activación

- Confirmar lotes/cantidades/ubicaciones y propietarios en la base real.
- Aplicar la nueva migración y configurar la clave de servidor en Vercel.
- Probar login, importación, revisión y solicitud WhatsApp en navegador.
- Probar dos reservas simultáneas de la última copia desde conexiones distintas a PostgreSQL real; PGlite serializa sus conexiones.
- Confirmar credenciales, cobertura y cuotas de los proveedores. Las consultas externas estaban bloqueadas por la política de red durante el desarrollo.
- Capturar escritorio y móvil para comparación visual y revisar consola, foco, diálogos y ventanas de WhatsApp. Las pruebas DOM/HTTP no sustituyen esa revisión.

## Acceso con contraseña: 6 de octubre de 2026

El login usa correo/contraseña y ya no solicita enlaces mágicos. Los 52 tests pasan, junto con lint, TypeScript y build. Las nuevas pruebas comprueban credenciales incorrectas/reintento, sesión obligatoria, fallos de red, bloqueo de envíos simultáneos y conservación del ID/permisos al configurar una contraseña. También verifican que un rol revocado no pueda recuperarse mediante la lista anterior de correos.

El servidor compilado respondió 200 en `/login` con campos de usuario y contraseña y sin botón de envío de enlace. `/admin` sin sesión siguió redirigiendo a login; la tienda conservó su vitrina. La consulta pública de ajustes de Supabase confirmó que Email está habilitado.

Se comprobó la entrada oculta del comando de contraseña con datos ficticios y cancelación por confirmación diferente, sin enviar solicitudes de modificación a Supabase. No se configuró ninguna contraseña real: falta la clave de servidor. El login completo con una cuenta real y su contraseña elegida queda pendiente; consulta [ACCESO_ADMIN.md](ACCESO_ADMIN.md).

## Ajustes de cuenta y Usuarios: 6 de octubre de 2026

Los 62 tests pasan, con lint, TypeScript y build. Ajustes permite cambiar la contraseña de la propia cuenta, verificando primero contraseña actual e identidad de sesión, incluso con el panel anterior. Usuarios permite a propietarios crear cuentas con contraseña, cambiar roles, restablecer contraseñas de otros administradores activos y revocar acceso. Las pruebas verifican permisos, protección contra revocar/degradar el propio rol, errores de creación parcial, confirmación de contraseña y ausencia de contraseñas en los recibos de roles.

HTTP del servidor compilado: Ajustes/Usuarios anónimos redirigen a login; las dos APIs de cuenta rechazan sesiones ausentes con 401 y orígenes externos con 403. El login responde 200. La comprobación del login real con las credenciales solicitadas devolvió `invalid_credentials`; no se ha establecido esa contraseña. La creación/restablecimiento de cuentas y la contraseña inicial real siguen pendientes por falta de SUPABASE_SERVICE_ROLE_KEY; no se escribió ningún password de usuario en archivos ni se modificó una cuenta real. La gestión de roles utiliza la migración de operaciones existente, sin una migración nueva.

## Preflight de migración: 7 de octubre de 2026

La clave de servidor ya permite leer el proyecto. Supabase Auth aceptó las credenciales de la cuenta propietaria y el usuario confirmó que pudo entrar en la tienda publicada. El RPC `current_admin_role` sigue ausente (`PGRST202`), por lo que la administración nueva continúa pendiente de instalación.

La comprobación de solo lectura mediante REST encontró 294 impresiones, 298 listados, 298 lotes, 289 listados publicados y 332 copias en UNASSIGNED. Todos los listados publicados tienen stock positivo. Hay 12 976 referencias de mercado, 109 propuestas y una solicitud con una línea. No se modificaron estos registros. Esta comprobación REST no sustituye el preflight SQL, la copia de seguridad ni una prueba de restauración.

El esquema real ya incluye `market_prices.source_url`. Se corrigió la migración para conservar esa columna y sus valores. Las 19 pruebas PostgreSQL de operaciones pasan, incluida la actualización de un esquema con esa columna y una vista pública de disponibilidad booleana.

La aplicación real de la migración permanece bloqueada: falta un token de gestión Supabase o una conexión SQL. La clave de servidor permite Auth/REST, pero no ejecuta DDL. Se guardó el requisito `SUPABASE_ACCESS_TOKEN` dirigido a `api.supabase.com` en el borrador del entorno; todavía se necesita ingresar el valor de forma segura y aplicar/publicar la configuración.

## Activación en producción: 7 de octubre de 2026

La migración `202610040001_operations.sql` quedó aplicada mediante la API de gestión de Supabase después del preflight SQL. Antes se confirmó una copia física COMPLETED del día, se exportó el esquema público y sus datos a un archivo privado fuera de Git y se reconstruyó una copia local PostgreSQL/PGlite. El ensayo local preservó los 15 esquemas de tabla y todos sus registros originales; verificó recepción sobre una variante existente, traslado conservando propietario y permisos públicos/privados. No se restauró la copia física de Supabase durante estas comprobaciones.

Compatibilidad corregida antes de la aplicación: `market_prices.source_url` existente, tablas anteriores de importación, restricciones de idioma/condición/acabado, índice de variante activo parcial y propietario de los lotes. Los importadores nuevos usan `operation_import_batches`/`operation_import_rows`; las 8 importaciones y 3371 filas anteriores se conservan. Los RPC administrativos anteriores quedan restringidos al servidor. La aplicación live corresponde al cambio `1c68d85`.

Las huellas de todas las columnas originales de las 15 tablas públicas coinciden exactamente antes/después. Se conservan 298 listados, 332 copias y sus propietarios; la nueva vista pública expone los mismos 289 listados, con 322 copias publicadas. Ambos administradores originales tienen rol owner. Se registró la versión, commit y SHA-256 de la migración en `activity_log`. No se volvió a ejecutar el seed ni se inventó stock o ubicaciones físicas.

Validación: 64 pruebas aprobadas, lint y build con TypeScript aprobados. Tras el último ajuste de restricciones de idioma se repitieron las 21 pruebas PostgreSQL y el ensayo sobre la copia real, ambos aprobados.

HTTP autenticado de `https://www.vego.singles`: `/admin` y `/admin/usuarios` devolvieron 200 sin el aviso de migración pendiente; los endpoints counts, batches, inventory y team respondieron 200. Inventory devolvió total 298 con 50 filas en la primera página; el equipo tiene dos propietarios y el importador nuevo está vacío. La configuración pública confirmó registro de solicitudes habilitado. La sesión usada para estas lecturas se cerró con alcance local, sin cerrar otras sesiones. No se crearon solicitudes, ventas ni ajustes físicos reales para hacer las pruebas; la comprobación no sustituye el recorrido visual en navegador ni una prueba simultánea de reservas desde dos conexiones reales.

Pendiente de operación, no de instalación: las 332 copias continúan en UNASSIGNED hasta ubicarlas físicamente; hay 294 identidades pendientes de revisión y el tipo de cambio/costos deben configurarse según la política real del negocio.
