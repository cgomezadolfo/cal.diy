# Fase 2: Branding — Agenda Systemlabs

## Contexto

Con la fase 1 (despliegue) funcionando en `agenda.systemlabs.cl`, esta fase reemplaza el branding heredado de "Cal.diy"/"Cal.com" por "Agenda Systemlabs" — nombre, logos, favicons y los textos que no eran dinámicos. Se hizo un escaneo del repo para mapear exactamente dónde vive cada pieza de branding antes de tocar nada (ver decisiones abajo).

Decisiones tomadas:
- **Nombre de marca:** `Agenda Systemlabs` (usado en textos, emails, títulos de página).
- **Idiomas editados:** solo `en` y `es` (los ~50 locales adicionales del fork quedan con "Cal.diy" en los strings hardcodeados hasta que haga falta).
- **Color de acento:** sin cambios por ahora — se mantiene el navy casi negro (`#111827`) que ya traía cal.diy. Los assets de logo nuevos usan ese mismo color para no desentonar. Cambiarlo después es editar `packages/config/theme/tokens.css` (`--cal-brand`, light y dark).
- **Logo:** placeholder generado localmente (wordmark "Agenda" + monograma "A"), reemplazable después sin tocar código — mismos nombres de archivo, solo hay que pisar los PNG/SVG en `apps/web/public`.

## Cómo funciona el branding en este fork (mapa de mecanismos)

- **Texto dinámico vía env vars:** `packages/lib/constants.ts` define `APP_NAME`, `COMPANY_NAME`, `SENDER_NAME`, `SUPPORT_MAIL_ADDRESS`, etc., todos con `process.env.NEXT_PUBLIC_*` y fallback hardcodeado. Cambiamos los **fallbacks** directamente en el código (para no depender de que alguien recuerde setear el env var), pero también documentamos las env vars por si se prefiere overridear sin rebuild.
- **Logos/favicons:** los *paths* son fijos en `constants.ts` (ej. `/calcom-logo-white-word.svg`) — no son env-driven. Rebrandear = **reemplazar el contenido de esos archivos**, sin cambiar nombres ni constants.ts. Todo fluye a través de `apps/web/app/api/logo/route.ts`, que sirve estos archivos como fallback (y soporta whitelabel por equipo/org vía DB, deshabilitado en self-hosted).
- **i18n:** la mayoría de los strings usan `{{appName}}` interpolado con `APP_NAME` (se rebranda solo con el env var/fallback). Un subconjunto (~30-34 por idioma) tiene "Cal.diy" literal en `packages/i18n/locales/<lang>/common.json` — esos requieren edición manual, hecha en `en` y `es`.
- **Footer "powered by" en booking pages:** ya viene con el body vacío (`{null}`) en este fork — no hay atribución a Cal.com que quitar.

## Cambios aplicados (rama `agenda`)

1. **`packages/lib/constants.ts`** — fallbacks actualizados: `APP_NAME`, `COMPANY_NAME`, `SENDER_NAME`, `SENDER_ID` → "Agenda"/"Agenda Systemlabs"; `SUPPORT_MAIL_ADDRESS` → `soporte@systemlabs.cl` (⚠️ **placeholder, no confirmado que exista ese buzón** — ver pendientes).
2. **`packages/ui/components/logo/Logo.tsx`** — `alt`/`title` estaban hardcodeados a `"Cal.diy"`; ahora usan `APP_NAME` importado de `@calcom/lib/constants`.
3. **Assets reemplazados** en `apps/web/public/` (mismos nombres de archivo que espera `constants.ts`, generados con PIL/SVG a mano — placeholder, no diseño final):
   - `calcom-logo-white-word.svg`, `cal-logo-word-black.svg` (wordmarks claro/oscuro)
   - `cal-com-icon-white.svg`, `safari-pinned-tab.svg` (ícono/monograma)
   - `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `mstile-150x150.png`, `android-chrome-192x192.png`, `android-chrome-256x256.png`, `favicon.ico`
   - `emails/logo.png` (logo de emails transaccionales)
   - `og-image.png` (**nuevo** — no existía; `SEO_IMG_DEFAULT` en `constants.ts` apunta a `${CAL_URL}/og-image.png`, y `CAL_URL` resuelve a nuestro propio dominio salvo que se setee `NEXT_PUBLIC_WEBSITE_URL`, así que este archivo faltante hacía que compartir un link de la app en redes/Slack mostrara una preview rota. Ya está resuelto).
4. **`apps/web/public/site.webmanifest`** — `name`/`short_name`/`description` (era hardcodeado, no lee env vars).
5. **`apps/web/app/layout.tsx`** / **`apps/web/pages/_document.tsx`** — `msapplication-TileColor`/`application-TileColor` de `#ff0000` a `#111827`; se sacaron los handles de Twitter `@calcom` (no tenemos cuenta propia que poner ahí).
6. **`packages/i18n/locales/{en,es}/common.json`** — reemplazo mecánico de todas las ocurrencias literales de "Cal.diy" → "Agenda Systemlabs" (34 en inglés, 31 en español; JSON validado después del reemplazo).

## Pendiente: remanente de pricing en el onboarding (heredado de fase 1)

Ya documentado en `docs/plan-despliegue.md`: el wizard de onboarding-v3 muestra un plan "Team $15/mes" heredado de Cal.com Cloud. El escaneo confirmó que es un **feature flag en la tabla `Feature` de Postgres** (`slug = 'onboarding-v3'`), no algo controlable por env var. Para desactivarlo y volver al flujo legacy `/getting-started` (sin pantalla de precios):

```sql
UPDATE "Feature" SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'onboarding-v3';
```

Requiere acceso a la BD `agenda` en Dokploy (mismo Postgres compartido, hostname `supabasemigracion-postgresmigracion-ahpmxl`) — pendiente de ejecutar con el asistente del homelab, igual que se hizo con el `CREATE DATABASE` en fase 1.

Alternativa (si en algún momento se prefiere mantener el flujo v3 pero sin el plan de equipo): editar `apps/web/modules/onboarding/getting-started/onboarding-view.tsx` para sacar `team` del array `allPlans` — pero es un cambio de código que hay que re-aplicar en cada merge de upstream, así que el flag de DB es la opción recomendada.

## Pendientes conocidos (no bloqueantes)

- **Confirmar `soporte@systemlabs.cl`** — o cambiarlo por el email de soporte real que quieran usar (`packages/lib/constants.ts`, línea de `SUPPORT_MAIL_ADDRESS`).
- **Logo definitivo** — el actual es placeholder generado por script (Arial Bold, monograma "A", navy `#111827`). Reemplazar los mismos archivos en `apps/web/public/` cuando haya un diseño real; no requiere tocar código.
- **`continue-with-calcom-*.svg`** (botones de SSO con Cal.com) — no se tocaron; solo se renderizan si se configura OAuth de Cal.com como proveedor, cosa que no está en uso.
- **Color de acento** (`--cal-brand*` en `packages/config/theme/tokens.css`) — sin cambios, a definir cuando haya paleta.
- **Idiomas más allá de en/es** — mismos ~30 strings hardcodeados por completar si hace falta soporte a otro idioma.
- **`WEBSITE_URL`** (fallback `https://cal.com` en `constants.ts`) — no se tocó, se usa en varios lugares (login, 404, etc.) apuntando al marketing site de Cal.com; requiere revisión caso por caso antes de cambiarlo, se deja para una pasada futura.

## Deploy de estos cambios

Mismo flujo que fase 1: push a `agenda` → GitHub Actions recompila y publica `ghcr.io/cgomezadolfo/cal.diy:latest` → **hace falta apretar "Deploy" a mano en Dokploy** (seguimos sin el webhook de auto-redeploy, ver pendiente en `docs/plan-despliegue.md`).
