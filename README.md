# Vego Singles

Tienda en español y administración de cartas con Next.js, Supabase y Vercel. Inicio presenta las cartas de mayor precio; el catálogo se ordena de mayor a menor. Stock desconocido pide confirmación; solo cero confirmado muestra «Agotado».

La administración incluye importación CSV/TSV y listas pegadas, revisión de identidad/idioma/variante, evidencia y propuestas de precio, costos por lote, ubicaciones, ajustes, reservas, ventas confirmadas, solicitudes por WhatsApp, roles y auditoría. Las operaciones se ejecutan mediante comandos transaccionales con protección contra reintentos duplicados. Los precios se aprueban antes de cambiar la tienda.

La [guía de administración](docs/GUIA_ADMIN.md) explica instalación, procesos diarios y un **recorrido práctico de una hora**. Incluye una [plantilla CSV](docs/import-example.csv).

## Acceso administrador

En `/login`, el usuario es el correo administrador existente y el ingreso usa contraseña, sin enviar enlaces mágicos. Si la cuenta no tiene contraseña, un operador puede configurarla sin email con `npm run admin:set-password -- TU_CORREO_ADMIN`; se solicita de forma oculta y requiere la clave de servidor en un entorno privado. Consulta [ACCESO_ADMIN.md](docs/ACCESO_ADMIN.md) para habilitar la cuenta sin cambiar su identidad o permisos.

## Instalación y actualización

En un proyecto Supabase existente:

1. Respalda la base y comprueba el estado con [operations_preflight.sql](supabase/operations_preflight.sql). Ensaya la migración en una copia del proyecto.
2. Ejecuta **solo** [202610040001_operations.sql](supabase/migrations/202610040001_operations.sql). No vuelvas a cargar el seed ni la migración inicial sobre la base existente. Revisa el stock físico: los listados sin lotes reales no aparecen en la nueva vista pública.
3. Asigna propietarios siguiendo la guía y configura en Vercel las variables de [.env.example](.env.example). `SUPABASE_SERVICE_ROLE_KEY` permanece exclusivamente en el servidor. La clave pública no permite instalar migraciones ni registrar solicitudes.
4. Despliega, entra en `/admin`, configura ubicaciones/FX/política y comprueba una carta y una solicitud real antes de ampliar la operación.

En una base nueva, instala primero `202607300001_initial_schema.sql` y luego la migración de operaciones. El seed es opcional y solo se carga una vez; sus identidades, costos y ubicaciones requieren revisión.

Sin la nueva migración, `/admin` conserva el panel anterior autorizado por `ADMIN_EMAILS`. Sin la clave de servidor, el carrito conserva la consulta directa por WhatsApp. No se cobra online ni se reserva stock al agregar al carrito. El catálogo nunca inventa cantidades; los ejemplos de diseño están etiquetados.

## Desarrollo y comprobaciones

Usa Node 24 o una versión compatible con Next.js 15:

```bash
npm ci
npm run dev
```

Copia `.env.example` a `.env.local` y completa credenciales fuera de Git. Las variables ya inyectadas en el entorno prevalecen sobre ese archivo. En el cloud administrado usa `NODE_USE_ENV_PROXY=1` para las consultas Node y `npm ci --cache /tmp/vego-npm-cache` si no puedes escribir en la caché global. Permite el dominio del proyecto Supabase y los proveedores que utilices; la guía enumera los hosts.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

La CI ejecuta estas comprobaciones con el lockfile. Las pruebas usan DOM y PostgreSQL mediante PGlite; los adaptadores externos tienen respuestas de ejemplo. Consulta [VALIDATION.md](docs/VALIDATION.md) para resultados, límites y comprobaciones pendientes contra producción. La comparación visual requiere navegador; su historial está en [design-qa.md](design-qa.md).
