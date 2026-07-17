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

Esta es la primera corrida de este workflow — es razonable que necesite 1-2 iteraciones de ajuste si el build falla en CI por algo no documentado en el README de cal.diy.

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
- [ ] Verificar que el workflow corrió OK y hacer público el paquete en `ghcr.io`.
- [ ] Crear BD `agenda` en el PG de Dokploy.
- [ ] Crear servicio Compose en Dokploy apuntando a la rama `agenda`.
- [ ] Configurar dominio `agenda.systemlabs.cl` en Dokploy (HTTP, sin Let's Encrypt).
- [ ] Verificar/ajustar túnel de Cloudflare.
- [ ] Primer arranque, wizard de setup, verificación end-to-end.

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

### 3. Preparar la base de datos en el PG existente de Dokploy
Ejecutar en el PG (vía Dokploy o psql):
```sql
CREATE USER agenda WITH PASSWORD '<password-fuerte>';
CREATE DATABASE agenda OWNER agenda;
```
Anotar el **hostname interno** del servicio PG en la red `dokploy-network` (nombre del contenedor/servicio en Dokploy) para el `DATABASE_URL`.

### 4. Compose específico para Dokploy — hecho (`docker-compose.dokploy.yml`)
Solo el servicio web, sin PG/Redis/API/Prisma-Studio del compose oficial, y sin `build:` (la imagen ya viene compilada de `ghcr.io`, ver "Estrategia de build" arriba):
- `image: ghcr.io/cgomezadolfo/cal.diy:latest` con `pull_policy: always`.
- `environment:` runtime: `DATABASE_URL`, `DATABASE_DIRECT_URL`, `NEXTAUTH_URL=https://agenda.systemlabs.cl`, `NEXT_PUBLIC_WEBAPP_URL`, `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`.
- Red externa `dokploy-network` (para que Traefik y el PG lo alcancen), expone puerto interno 3000.
- Valores sensibles como `${VARIABLES}` → se definen en la pestaña Environment de Dokploy, no en el repo.

### 5. Crear el servicio en Dokploy
- Proyecto **agenda** → servicio tipo **Compose**, source: GitHub `cgomezadolfo/cal.diy`, rama `agenda`, archivo `docker-compose.dokploy.yml`.
- Cargar variables de entorno (secretos del paso 2, DATABASE_URL del paso 3).
- **Dominio:** `agenda.systemlabs.cl` → puerto contenedor `3000`, **HTTP** (el TLS lo termina Cloudflare; no usar Let's Encrypt, no llegará el challenge por el túnel).
- Deploy: como Dokploy solo hace `pull` (no compila), esto debería tardar segundos/minutos, no 20-40 min. Monitorear logs del arranque (migraciones Prisma).

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

## Pendientes conocidos (post fase 1, anotar como issues)
- **SMTP** (`EMAIL_*`): sin esto no salen correos de confirmación de reservas.
- **VAPID keys** para notificaciones push (opcional).
- **OAuth Google Calendar / integraciones**: requieren credenciales propias en Google Cloud.
- **Fase 2 branding:** logos en `apps/web/public`, colores/tema, nombre de la app — siempre en la rama `agenda`.
