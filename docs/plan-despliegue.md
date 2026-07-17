# Desplegar cal.diy como "agenda" en Dokploy (agenda.systemlabs.cl)

## Contexto

Queremos un Cal.com self-hosted usando **cal.diy** (fork 100% MIT de Cal.com, sin código enterprise). Se llamará **agenda**, desplegado en `agenda.systemlabs.cl` vía **Dokploy** en el homelab (x86, ≥8GB RAM), con el **PostgreSQL existente en Dokploy** y salida a internet por **túnel de Cloudflare**.

- **Fase 1 (este plan):** despliegue funcional.
- **Fase 2 (futuro):** branding e imagen.

Hallazgos de la investigación:
- No existe imagen Docker precompilada utilizable (`calcom/cal.diy` en Docker Hub tiene 0 tags) → **hay que construir desde el código**.
- El build es pesado (~8GB RAM, 20-40 min) y **necesita una BD accesible durante el build** (peculiaridad de Cal.com).
- El contenedor ejecuta `prisma migrate deploy` automáticamente al arrancar → solo se necesita una BD vacía.
- Redis y el API v2 del compose oficial son **opcionales**; para fase 1 basta el webapp + PG.
- El fork base es `https://github.com/cgomezadolfo/cal.diy`.

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
- [ ] Pushear rama `agenda` a origin.
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
Solo el servicio web, sin PG/Redis/API/Prisma-Studio del compose oficial:
- `build:` con contexto `.` y el `Dockerfile` del repo, pasando **build args**: `DATABASE_URL`, `NEXT_PUBLIC_WEBAPP_URL=https://agenda.systemlabs.cl`, `NEXT_PUBLIC_LICENSE_CONSENT`.
- `environment:` runtime: `DATABASE_URL`, `DATABASE_DIRECT_URL`, `NEXTAUTH_URL=https://agenda.systemlabs.cl`, `NEXT_PUBLIC_WEBAPP_URL`, `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`.
- Red externa `dokploy-network` (para que Traefik y el PG lo alcancen), expone puerto interno 3000.
- Valores sensibles como `${VARIABLES}` → se definen en la pestaña Environment de Dokploy, no en el repo.

**Caveat del build:** el build necesita alcanzar el PG. Si la red de build no llega a `dokploy-network`, exponer temporalmente el puerto 5432 del PG en el host y usar la IP del host en el `DATABASE_URL` de build.

### 5. Crear el servicio en Dokploy
- Proyecto **agenda** → servicio tipo **Compose**, source: GitHub `cgomezadolfo/cal.diy`, rama `agenda`, archivo `docker-compose.dokploy.yml`.
- Cargar variables de entorno (secretos del paso 2, DATABASE_URL del paso 3).
- **Dominio:** `agenda.systemlabs.cl` → puerto contenedor `3000`, **HTTP** (el TLS lo termina Cloudflare; no usar Let's Encrypt, no llegará el challenge por el túnel).
- Deploy y monitorear logs del build (20-40 min la primera vez) y del arranque (migraciones Prisma).

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
