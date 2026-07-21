# Agenda Systemlabs — estado del proyecto

Fork de [cal.diy](https://github.com/calcom/cal.diy) (Cal.com sin código enterprise), desplegado en `agenda.systemlabs.cl` vía Dokploy en el homelab, detrás de un túnel de Cloudflare. Toda la config vive en la rama **`agenda`** (nunca en `main`, que es espejo de upstream — ver estrategia de fork en `plan-despliegue.md`).

> `docs/api-reference/` es contenido heredado de upstream (documentación de la API de Cal.com), no algo que hayamos escrito nosotros — ignorar para efectos de este resumen.

## Documentos

- **[plan-despliegue.md](./plan-despliegue.md)** — Fase 1: cómo quedó armado el despliegue (build en GitHub Actions → `ghcr.io/cgomezadolfo/cal.diy` → Dokploy hace pull/run). Incluye la estrategia de build, la config del servicio en Dokploy, hostname/credenciales de la BD, y todos los pendientes técnicos.
- **[plan-fase2-branding.md](./plan-fase2-branding.md)** — Fase 2: rebranding de "Cal.diy" a "Agenda Systemlabs" (logos, textos, i18n). Incluye el mapa de mecanismos de branding del fork (qué es env-driven vs. qué requiere editar archivos).
- **[plan-fase3-comunicaciones-meet.md](./plan-fase3-comunicaciones-meet.md)** — Fase 3: correos transaccionales (SMTP) y Google Meet/Calendar como ubicación de reunión, más el rename de "Cal Video" → "Reunión online".
- **[plan-fase4-pagos-mercadopago.md](./plan-fase4-pagos-mercadopago.md)** — Fase 4 (planificada, no ejecutada): pagos por reserva vía Mercado Pago, modelo "cada prestador conecta su propia cuenta". Incluye el hallazgo de que la página de pago está rota hoy (para cualquier pasarela) y el diseño completo de la integración.

## Estado al cierre de la sesión 2026-07-18

- ✅ **Fase 1 completa**: `agenda.systemlabs.cl` en producción, deploy limpio, admin creado.
- ✅ **Fase 2 completa**: branding "Agenda Systemlabs" aplicado y confirmado visualmente en producción (logo, favicon, título, sin pantalla de $15/mes).
- 🔧 **Fase 3 en curso**: se renombró "Cal Video" → "Reunión online" en el código (commiteado). Falta ejecutar la configuración externa: elegir proveedor SMTP + cargar credenciales en Dokploy, y armar el proyecto de Google Cloud Console para Google Calendar/Meet. Detalle paso a paso listo en `plan-fase3-comunicaciones-meet.md`.
- 📋 **Fase 4 documentada, no iniciada**: pagos por reserva vía Mercado Pago. Se encontró que la página `/payment/[uid]` está con el cargador de datos stubbeado (ni PayPal funciona hoy) — es la primera tarea de esa fase, sin importar la pasarela. Diseño completo en `plan-fase4-pagos-mercadopago.md`, a la espera de que el usuario tenga cuenta de Mercado Pago para probar.

## Pendientes abiertos (no bloqueantes, ver detalle en cada doc)

| Pendiente | Dónde está detallado |
|---|---|
| Auto-redeploy en Dokploy (webhook tras cada build de CI) | `plan-despliegue.md` |
| VAPID keys (push notifications) | `plan-despliegue.md` |
| Confirmar email de soporte real (`soporte@systemlabs.cl` es placeholder) | `plan-fase2-branding.md` |
| Logo definitivo (el actual es placeholder generado por script) | `plan-fase2-branding.md` |
| Color de acento de la app (`--cal-brand*`, sin definir aún) | `plan-fase2-branding.md` |
| Idiomas más allá de en/es (mismo patrón de strings hardcodeados) | `plan-fase2-branding.md` |
| Limpieza de `WEBSITE_URL` (sigue apuntando a cal.com en algunos lugares) | `plan-fase2-branding.md` |
| Elegir proveedor SMTP y configurarlo en Dokploy | `plan-fase3-comunicaciones-meet.md` |
| Proyecto de Google Cloud Console + `GOOGLE_API_CREDENTIALS` | `plan-fase3-comunicaciones-meet.md` |
| Restaurar loader de `/payment/[uid]` (bloquea todos los pagos) | `plan-fase4-pagos-mercadopago.md` |
| Cuenta + credenciales de test de Mercado Pago | `plan-fase4-pagos-mercadopago.md` |

## Accesos / datos clave (sin secretos)

- Repo: `https://github.com/cgomezadolfo/cal.diy`, rama de trabajo `agenda`.
- Imagen: `ghcr.io/cgomezadolfo/cal.diy:latest` (pública, se recompila con cada push a `agenda` vía `.github/workflows/build-agenda-image.yml`).
- BD: Postgres compartido de Dokploy, hostname interno `supabasemigracion-postgresmigracion-ahpmxl`, base `agenda`.
- Credenciales reales (`DATABASE_URL`, `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`) — **no están en el repo** (es público). Viven solo en el panel Environment de la app en Dokploy.
