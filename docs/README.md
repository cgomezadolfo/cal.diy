# Agenda Systemlabs — estado del proyecto

Fork de [cal.diy](https://github.com/calcom/cal.diy) (Cal.com sin código enterprise), desplegado en `agenda.systemlabs.cl` vía Dokploy en el homelab, detrás de un túnel de Cloudflare. Toda la config vive en la rama **`agenda`** (nunca en `main`, que es espejo de upstream — ver estrategia de fork en `plan-despliegue.md`).

> `docs/api-reference/` es contenido heredado de upstream (documentación de la API de Cal.com), no algo que hayamos escrito nosotros — ignorar para efectos de este resumen.

## Documentos

- **[plan-despliegue.md](./plan-despliegue.md)** — Fase 1: cómo quedó armado el despliegue (build en GitHub Actions → `ghcr.io/cgomezadolfo/cal.diy` → Dokploy hace pull/run). Incluye la estrategia de build, la config del servicio en Dokploy, hostname/credenciales de la BD, y todos los pendientes técnicos.
- **[plan-fase2-branding.md](./plan-fase2-branding.md)** — Fase 2: rebranding de "Cal.diy" a "Agenda Systemlabs" (logos, textos, i18n). Incluye el mapa de mecanismos de branding del fork (qué es env-driven vs. qué requiere editar archivos).

## Estado al cierre de la sesión 2026-07-17

- ✅ **Fase 1 completa**: `agenda.systemlabs.cl` en producción, deploy limpio, admin creado.
- ✅ **Fase 2 (branding placeholder) aplicada**: commit `f46b0f2dca` en `agenda`, build de GitHub Actions OK, se pidió el redeploy en Dokploy.
- ✅ **Pantalla de precios de Cal.com Cloud en el onboarding**: desactivada vía feature flag en DB (`onboarding-v3` → `enabled = false`).
- ⏳ **Pendiente para arrancar la próxima sesión**: confirmar visualmente que el redeploy trajo el branding nuevo (logo, favicon, título de página) y que el onboarding ya no muestra el plan de $15/mes. Si algo no se ve, probar hard-refresh/incógnito antes de asumir que falló (favicons cachean agresivo).

## Pendientes abiertos (no bloqueantes, ver detalle en cada doc)

| Pendiente | Dónde está detallado |
|---|---|
| Auto-redeploy en Dokploy (webhook tras cada build de CI) | `plan-despliegue.md` |
| SMTP para emails transaccionales | `plan-despliegue.md` |
| VAPID keys (push notifications) | `plan-despliegue.md` |
| OAuth Google Calendar / integraciones | `plan-despliegue.md` |
| Confirmar email de soporte real (`soporte@systemlabs.cl` es placeholder) | `plan-fase2-branding.md` |
| Logo definitivo (el actual es placeholder generado por script) | `plan-fase2-branding.md` |
| Color de acento de la app (`--cal-brand*`, sin definir aún) | `plan-fase2-branding.md` |
| Idiomas más allá de en/es (mismo patrón de strings hardcodeados) | `plan-fase2-branding.md` |
| Limpieza de `WEBSITE_URL` (sigue apuntando a cal.com en algunos lugares) | `plan-fase2-branding.md` |

## Accesos / datos clave (sin secretos)

- Repo: `https://github.com/cgomezadolfo/cal.diy`, rama de trabajo `agenda`.
- Imagen: `ghcr.io/cgomezadolfo/cal.diy:latest` (pública, se recompila con cada push a `agenda` vía `.github/workflows/build-agenda-image.yml`).
- BD: Postgres compartido de Dokploy, hostname interno `supabasemigracion-postgresmigracion-ahpmxl`, base `agenda`.
- Credenciales reales (`DATABASE_URL`, `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`) — **no están en el repo** (es público). Viven solo en el panel Environment de la app en Dokploy.
