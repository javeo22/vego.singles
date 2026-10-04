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
