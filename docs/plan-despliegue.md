# Desplegar cal.diy como "agenda" en Dokploy (agenda.systemlabs.cl)

## Contexto

Queremos un Cal.com self-hosted usando **cal.diy** (fork 100% MIT de Cal.com, sin código enterprise). Se llamará **agenda**, desplegado en `agenda.systemlabs.cl` vía **Dokploy** en el homelab (x86, ~2GB RAM libres — suficiente para *correr* el contenedor, no para compilarlo), con el **PostgreSQL existente en Dokploy** y salida a internet por **túnel de Cloudflare**. La imagen se compila aparte, en GitHub Actions (ver "Estrategia de build" abajo).

- **Fase 1 (este plan):** despliegue funcional.
- **Fase 2 (futuro):** branding e imagen.

Hallazgos de la investigación:
- No existe imagen Docker precompilada utilizable (`calcom/cal.diy` en Docker Hub tiene 0 tags) → **hay que construir desde el código**.
- El build es pesado (~8GB RAM, 20-40 min) y **necesita una BD accesible durante el build** (peculiaridad de Cal.com; confirmado también revisando el Dockerfile: `DATABASE_URL` es un `ARG` usado en el stage `builder`).
- El homelab **no tiene 8GB libres** para hacer ese build → se decidió compilar la imagen fuera del homelab y que Dokploy solo la ejecute (ver sección "Estrategia de build" abajo).
- El contenedor ejecuta `prisma migrate deploy` automáticamente al arrancar (`scripts/start.sh`) → solo se necesita una BD vacía/migrada en runtime.
- `NEXTAUTH_SECRET` y `CALENDSO_ENCRYPTION_KEY` tienen defaults `"secret"` en el Dockerfile y **no se hornean en la imagen final** (el stage `runner` solo fija `NEXT_PUBLIC_WEBAPP_URL`, `BUILT_NEXT_PUBLIC_WEBAPP_URL` y `NODE_ENV`) → en el build de CI se pueden usar valores dummy; los reales solo importan en runtime, inyectados por Dokploy.
- Redis y el API v2 del compose oficial son **opcionales**; para fase 1 basta el webapp + PG.
- **RAM para correr el servicio (no compilarlo):** la app es un único proceso Next.js standalone, sin la BD (que vive aparte en el PG de Dokploy). Estimación práctica: **~2GB de RAM** da margen cómodo para un equipo chico; con 1GB podría andar para uso muy liviano pero sin margen. Fuentes de referencia: [Contabo — Self-Host cal.com](https://contabo.com/blog/self-host-cal-com-with-docker-and-postgresql/), [OSSAlt — Self-Hosting Cal.com 2026](https://ossalt.com/guides/self-hosting-guide-calcom-2026) (mencionan 2-4GB para instalaciones chicas, incluyendo la BD que en nuestro caso no cuenta).
- El fork base es `https://github.com/cgomezadolfo/cal.diy`.

## Estrategia de build (imagen se compila fuera del homelab)

El homelab no tiene RAM libre para el build (~8GB necesarios). En vez de que Dokploy compile desde git, un **workflow de GitHub Actions** (`.github/workflows/build-agenda-image.yml`, corre en cada push a la rama `agenda`) hace el build en un runner x86_64 nativo (gratis para repos públicos) y publica la imagen en **`ghcr.io/cgomezadolfo/cal.diy`**. Dokploy solo hace `docker pull` + `run` — por eso el requisito de RAM en el homelab baja de ~8GB (build) a ~2GB (solo correr el proceso).

Detalles del workflow:
- Levanta un Postgres efímero como `services:` de GitHub Actions, corre `prisma migrate deploy` contra él, y ese mismo Postgres se usa como `DATABASE_URL` de build.
- Agrega un swapfile de 8GB antes de compilar — el build por defecto pide hasta 6GB de heap Node (`NODE_OPTIONS=--max-old-space-size=6144` en el Dockerfile) y el runner estándar de GitHub solo tiene 7GB de RAM; el swap es la red de seguridad estándar para este tipo de build pesado en CI.
- Usa `docker/setup-buildx-action` con `driver-opts: network=host` para que el build (que corre `RUN` steps dentro del Dockerfile) pueda alcanzar el Postgres efímero en `localhost:5432`.
- Publica tags `latest` y el SHA del commit.
- Autentica contra `ghcr.io` con el `GITHUB_TOKEN` automático de Actions (permiso `packages: write`) — no requiere gestionar un PAT aparte.

**Pendiente tras el primer push exitoso:** el paquete en `ghcr.io/cgomezadolfo/cal.diy` nace **privado** por defecto. Hay que ir a Settings del paquete en GitHub y ponerlo **público** (o si se prefiere privado, generar un PAT con `read:packages` y configurarlo como credencial de registry en Dokploy). Público es más simple: Dokploy hace pull anónimo sin credenciales.

**Estado:** el workflow ya corrió con éxito (14m19s) tras 3 ajustes sobre la primera versión:
1. `/swapfile` ya existe y está activo por defecto en los runners de GitHub → el fallocate fallaba con "Text file busy"; se agregó swap extra en `/mnt/extra-swapfile` en vez de tocar el existente.
2. `npx prisma` sin versión resolvía la última release (exige Node ≥22) → se pineó a `prisma@6.16.1`, la misma versión que usa el repo (`packages/prisma/package.json`).
3. Al `schema.prisma` le faltaba `DATABASE_DIRECT_URL` en el env del paso de migración (el schema define `directUrl` además de `url`).

El paquete resultante en `ghcr.io/cgomezadolfo/cal.diy` quedó **público automáticamente** (hereda la visibilidad del repo) — Dokploy puede hacer `pull` sin credenciales.

> Nota: al pushear a esta rama también corren dos workflows heredados de upstream (`i18n.yml`, `release-docker.yaml`) que fallan en 0s por un bug propio de cal.diy (usan `secrets.*` dentro de un `if:` a nivel de job, algo que GitHub Actions no permite ahí). Es ruido inofensivo, no bloquea nada; se puede desactivar más adelante si molesta.

## Estrategia de fork y actualizaciones

Los updates de upstream **no borran** las customizaciones — se integran con merge:

- `main` → espejo de `calcom/cal.diy` (nunca se toca directamente).
- Rama **`agenda`** → todos nuestros cambios (config de despliegue ahora, branding en fase 2). **Dokploy despliega esta rama.**
- Flujo de actualización: `git fetch upstream && git checkout main && git merge upstream/main && git push` → luego `git checkout agenda && git merge main`. Conflictos solo si upstream tocó las mismas líneas que nosotros (raro con branding aislado en logos/colores/textos).
- **Convención de commits:** mensajes limpios, sin línea de coautoría (`Co-Authored-By`) ni firmas de herramientas.

## Progreso

- [x] Clonar fork `cgomezadolfo/cal.diy`, agregar remote `upstream`.
- [x] Crear rama `agenda`.
- [x] Crear `docs/plan-despliegue.md` (este archivo).
- [x] Crear `docker-compose.dokploy.yml` (solo servicio web, red externa `dokploy-network`).
- [x] Generar `NEXTAUTH_SECRET` y `CALENDSO_ENCRYPTION_KEY` (guardados fuera del repo, ver nota abajo).
- [x] Pushear rama `agenda` a origin.
- [x] Crear workflow de GitHub Actions que compila y publica la imagen en `ghcr.io/cgomezadolfo/cal.diy`.
- [x] Actualizar `docker-compose.dokploy.yml` para usar `image:` (ghcr.io) en vez de `build:`.
- [x] Workflow corrió OK (14m19s) y el paquete `ghcr.io/cgomezadolfo/cal.diy` quedó **público** automáticamente (hereda visibilidad del repo). Tags: `latest` y el SHA del commit.
- [x] Crear BD `agenda` en el PG de Dokploy (hostname interno confirmado: `supabasemigracion-postgresmigracion-ahpmxl`, ver sección "Variables de entorno finales" abajo).
- [x] Crear app en Dokploy (provider Docker, no Compose) apuntando a `ghcr.io/cgomezadolfo/cal.diy:latest`.
- [x] Configurar dominio `agenda.systemlabs.cl` en Dokploy (HTTP, sin Let's Encrypt).
- [x] Túnel de Cloudflare — funcionó sin ajustes (ya rutea a Dokploy).
- [x] Primer arranque, wizard de setup, verificación end-to-end.

> Los secretos generados **no se commitean**. Viven únicamente en el panel de Environment de Dokploy. Si se pierden, se regeneran con `openssl rand -base64 32` / `openssl rand -base64 24` (esto invalida sesiones activas).

## Pasos de implementación

### 1. Clonar el fork localmente — hecho
```bash
git clone --recursive https://github.com/cgomezadolfo/cal.diy.git .
git remote add upstream https://github.com/calcom/cal.diy.git
git checkout -b agenda
```

### 2. Generar secretos — hecho
```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 24   # CALENDSO_ENCRYPTION_KEY (AES256, 32 bytes)
```

### 3. Preparar la base de datos en el PG existente de Dokploy — hecho
```sql
CREATE USER agenda WITH PASSWORD '<password-fuerte>';
CREATE DATABASE agenda OWNER agenda;
```
El PG existente en Dokploy es una instancia compartida (nombre del servicio sugiere que se usa también para una migración de Supabase). El hostname interno, en la red `dokploy-network`, es:

```
supabasemigracion-postgresmigracion-ahpmxl
```

**Importante:** ese nombre resuelve a una IP interna (`10.0.1.13` al momento de escribir esto) que **ya cambió varias veces** — siempre usar el hostname DNS, nunca hardcodear la IP.

**Requisito verificado:** el servicio `calcom` en `docker-compose.dokploy.yml` ya está en la red `dokploy-network` (`external: true`, sin red propia) — necesario para que resuelva ese hostname. Ver sección "Variables de entorno finales" para el `DATABASE_URL` completo (password redactada en este doc porque el repo es público).

### 4. Compose específico para Dokploy — hecho (`docker-compose.dokploy.yml`)
Solo el servicio web, sin PG/Redis/API/Prisma-Studio del compose oficial, y sin `build:` (la imagen ya viene compilada de `ghcr.io`, ver "Estrategia de build" arriba):
- `image: ghcr.io/cgomezadolfo/cal.diy:latest` con `pull_policy: always`.
- `environment:` runtime: `DATABASE_URL`, `DATABASE_DIRECT_URL`, `NEXTAUTH_URL=https://agenda.systemlabs.cl`, `NEXT_PUBLIC_WEBAPP_URL`, `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`.
- Red externa `dokploy-network` (para que Traefik y el PG lo alcancen), expone puerto interno 3000.
- Valores sensibles como `${VARIABLES}` → se definen en la pestaña Environment de Dokploy, no en el repo.

### 5. Crear el servicio en Dokploy — en curso
Se optó por provider **Docker** (imagen directa) en vez de Compose: es un solo contenedor (sin Redis/API/DB propios), así que Dokploy maneja la red y el proxy solo, sin necesitar `docker-compose.dokploy.yml` para esto (ese archivo queda en el repo como referencia/alternativa, no se está usando).
- App creada en el proyecto **agenda**, provider **Docker**.
- **Docker Image**: `ghcr.io/cgomezadolfo/cal.diy:latest` (campo "Docker Image", no "Registry URL"). Registry URL/Username/Password vacíos — el paquete es público.
- Cargar variables de entorno (ver "Variables de entorno finales" abajo).
- **Puerto**: contenedor escucha en `3000`.
- **Dominio:** `agenda.systemlabs.cl` → puerto `3000`, **HTTP** (el TLS lo termina Cloudflare; no usar Let's Encrypt, no llegará el challenge por el túnel).
- **Red**: confirmar en Advanced que la app quede en `dokploy-network` para alcanzar el Postgres (`supabasemigracion-postgresmigracion-ahpmxl`).
- Deploy: como Dokploy solo hace `pull` (no compila), esto debería tardar segundos/minutos, no 20-40 min. Monitorear logs del arranque (migraciones Prisma).
- **Ver pendiente de auto-redeploy** en la sección "Pendientes conocidos" — con provider Docker, un push a git no dispara redeploy solo.

## Variables de entorno finales (pegar en el panel Environment de Dokploy)

**No committear este bloque con los valores reales** — este repo es público. Los valores reales (password de la BD, secretos) viven solo en Dokploy.

```
DATABASE_URL=postgresql://agenda:<password>@supabasemigracion-postgresmigracion-ahpmxl:5432/agenda
DATABASE_DIRECT_URL=postgresql://agenda:<password>@supabasemigracion-postgresmigracion-ahpmxl:5432/agenda
NEXTAUTH_URL=https://agenda.systemlabs.cl
NEXT_PUBLIC_WEBAPP_URL=https://agenda.systemlabs.cl
NEXTAUTH_SECRET=<generado con openssl rand -base64 32>
CALENDSO_ENCRYPTION_KEY=<generado con openssl rand -base64 24>
CALCOM_TELEMETRY_DISABLED=1
```

La password de la BD y los dos secretos se generaron/confirmaron durante esta sesión de despliegue (no se guardan en el repo ni en este doc).

### 6. Túnel de Cloudflare
Verificar en Cloudflare Zero Trust → Tunnels → public hostnames (o `config.yml` de cloudflared):
- **Si hay wildcard `*.systemlabs.cl` → Traefik de Dokploy:** no hay nada que hacer; solo el registro DNS si el wildcard DNS no existe.
- **Si es hostname por hostname:** agregar public hostname `agenda.systemlabs.cl` → mismo servicio/puerto al que apuntan las otras apps de Dokploy (típicamente `http://localhost:80` = Traefik). El CNAME en DNS se crea solo.
- En Cloudflare SSL/TLS, el modo actual del dominio ya funciona con las otras apps del túnel; no cambiar nada.

### 7. Primer arranque y setup
- Ver logs: migraciones OK, app escuchando en 3000.
- Abrir `https://agenda.systemlabs.cl/auth/setup` → wizard de primer usuario admin.

## Verificación (fin de fase 1)
1. `curl -I https://agenda.systemlabs.cl` responde 200/307.
2. Login con el admin creado, crear un event type, hacer una reserva de prueba y confirmar que aparece en el dashboard.
3. Reiniciar el contenedor desde Dokploy y verificar que levanta solo (migraciones idempotentes).

## Fase 1: COMPLETA ✅

Desplegado y verificado en `https://agenda.systemlabs.cl` el 2026-07-17. Deploy limpio, sin restarts, migraciones OK, admin creado (`admin`). El 502 inicial fue transitorio (Traefik tardó unos segundos en detectar el contenedor nuevo tras el deploy) — no fue necesaria ninguna corrección de red: Dokploy conecta automáticamente todas sus apps/DBs a la misma red interna, sin selector manual.

## Pendientes conocidos (post fase 1, anotar como issues)
- ~~Remanentes de pricing de Cal.com Cloud en el wizard de setup~~ — **resuelto** (2026-07-17) desactivando el feature flag `onboarding-v3` en la tabla `Feature` de Postgres (`UPDATE "Feature" SET "enabled" = false WHERE "slug" = 'onboarding-v3'`). Detalle completo en `docs/plan-fase2-branding.md`.
- **Auto-redeploy en Dokploy tras cada build.** Elegimos provider **Docker** (imagen) en vez de Compose/Git para la app en Dokploy — Dokploy no vigila el repo de git, solo la imagen. El workflow de GitHub Actions ya recompila y publica `ghcr.io/cgomezadolfo/cal.diy:latest` en cada push a `agenda`, pero **Dokploy no vuelve a hacer pull solo**: hay que apretar "Deploy" a mano cada vez, o buscar el "Deploy Webhook" de la app en Dokploy (normalmente en la pestaña General/Advanced/Deployments) y agregarlo como último step del workflow (`.github/workflows/build-agenda-image.yml`) para que el redeploy sea automático. **Importante no olvidar esto** — quedó pendiente de resolver explícitamente.
- **SMTP** (`EMAIL_*`): sin esto no salen correos de confirmación de reservas.
- **VAPID keys** para notificaciones push (opcional).
- **OAuth Google Calendar / integraciones**: requieren credenciales propias en Google Cloud.
- **Fase 2 branding:** logos en `apps/web/public`, colores/tema, nombre de la app — siempre en la rama `agenda`.
