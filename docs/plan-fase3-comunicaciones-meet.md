# Fase 3: Correos transaccionales + Google Meet/Calendar

## Contexto

Usando la app como lo haría un paciente real, aparecieron dos huecos funcionales que dejaban el sistema inutilizable en la práctica: no salían correos de confirmación (sin SMTP configurado) y la ubicación de reunión por defecto ("Cal Video") no genera links reales porque nunca se configuró Daily.co. Se decidió reemplazar Cal Video por **Google Meet** como ubicación principal y configurar un SMTP transaccional real.

Investigación completa hecha con subagentes de exploración antes de tocar código — ver decisiones abajo.

## Cambios de código aplicados (rama `agenda`)

**Rename "Cal Video" → "Reunión online".** El string está hardcodeado en dos lugares (no es traducible por i18n, confirmado leyendo el código):
- `packages/app-store/dailyvideo/_metadata.ts` — `name`, `title`, `appData.location.label` (esto último es lo que se ve en la página de confirmación de reserva), `description`, `publisher`.
- `packages/lib/CalEventParser.ts` (función `getProviderName`, ~línea 204) — el mismo string pero usado en emails/ICS.

Se dejó como fallback rebautizado en vez de invertir en configurar Daily.co, porque Google Meet pasa a ser la ubicación principal.

**Branding leaks encontrados al probar el flujo real** (booking confirmado, 404, login) y corregidos en un commit aparte (`fix: remove remaining Cal.diy/Cal.com branding leaks`):
- `apps/web/modules/auth/login-view.tsx` — heading hardcodeado `"Cal.diy"` → `{APP_NAME}`.
- `apps/web/app/notFoundClient.tsx` — la sección "Popular Pages" del 404 linkeaba a `DOCS_URL`/`WEBSITE_URL` de Cal.com (docs y blog); se removió porque no tenemos equivalentes propios. Nota: `DOCS_URL` está **hardcodeado** en `constants.ts` (no es env-driven, a diferencia de `WEBSITE_URL`).
- `apps/web/modules/auth/verify-email-view.tsx` y `packages/features/auth/lib/next-auth-options.ts` — dos usos menores de `"Cal.diy"` literal, cambiados a `APP_NAME`.

Build de CI de este segundo fix confirmado exitoso. **Pendiente confirmar si ya se le dio "Deploy" en Dokploy** — quedó pedido pero no confirmado explícitamente por el usuario antes de pasar a revisar los logs de Resend.

**También pendiente**: setear `NEXT_PUBLIC_WEBSITE_URL=https://agenda.systemlabs.cl` en el Environment de Dokploy (no comitear, no es secreto pero es config de deploy) — sin esto, el link "volver al inicio" del 404 y otros usos de `WEBSITE_URL` caen a `https://cal.com`.

## SMTP transaccional — Resend, EN PROGRESO

**Decisión:** Resend. Este fork tiene soporte nativo — con solo `RESEND_API_KEY` seteado, `packages/lib/serverConfig.ts` usa automáticamente `smtp.resend.com` sin necesidad de configurar `EMAIL_SERVER_HOST/PORT/USER/PASSWORD` a mano.

**Hecho:**
- Cuenta creada en Resend, dominio `systemlabs.cl` agregado, registros DNS cargados en Cloudflare.
- En Dokploy (Environment): `RESEND_API_KEY`, `EMAIL_FROM=notificaciones@systemlabs.cl`, `EMAIL_FROM_NAME=Agenda Systemlabs` — cargados por el usuario directamente (nunca pasaron por este chat, correcto).
- **Verificación de dominio confirmada indirectamente** revisando el log de actividad de Resend: un primer test de reserva falló con `403 Domain not verified`, un segundo test (unos minutos después) devolvió `200 OK` — el dominio se verificó en el medio. Resend está funcionando.

**Sin confirmar todavía (primer punto a retomar mañana):** los dos envíos vistos en el log de Resend eran el correo de **"problema al agregar enlace de video"** (`packages/emails/templates/broken-integration-email.ts` — confirmado en el código que este email **solo se manda al organizador**, `toAddresses = [this.calEvent.organizer.email]`, nunca a los invitados). Osea que todavía no vimos si el correo de **confirmación de reserva real** (el que le debería llegar a la paciente por Gmail) efectivamente se envió y con qué resultado.

**Próximo paso inmediato:** en el dashboard de Resend, buscar en el log de actividad, cerca del mismo horario de la prueba con "nancy gomez", un POST a `/emails` con `"to": ["cgomez.adolfo@gmail.com"]` (un asunto de confirmación normal, no el de "problema al agregar enlace de video"). Tres resultados posibles:
- **200/"Delivered"** → todo bien, probablemente cayó en spam (normal en dominios nuevos, mejora con el tiempo/reputación).
- **Bounced/Complained** → problema real de entrega a investigar.
- **No aparece ningún envío a esa dirección** → bug real: el código no está mandando la confirmación al invitado, hay que investigar el flujo de `sendScheduledEmailsAndSMS` / templates de confirmación.

### Google Calendar + Google Meet
**En Google Cloud Console** (lo hace el usuario):
1. Crear proyecto, habilitar Google Calendar API.
2. Configurar OAuth consent screen.
3. Crear credencial OAuth client ID → Web application.
4. Authorized redirect URI exacto: `https://agenda.systemlabs.cl/api/integrations/googlecalendar/callback`
5. Descargar el JSON del cliente (`{"web":{"client_id":...,"client_secret":...,"redirect_uris":[...]}}`).

**En Dokploy** (Environment):
```
GOOGLE_API_CREDENTIALS=<JSON descargado, minificado a una línea>
```

**Cargar las keys en la BD** (el seeder de build no corre en este deploy — confirmado por el warning "Error adding google credentials to DB: Unexpected end of JSON input" en los logs de fase 1, porque `GOOGLE_API_CREDENTIALS` no estaba seteado en ese momento). Sin código ni SQL: login como admin → `/settings/admin/apps/calendar` → activar **Google Calendar** → "Edit keys" → pegar `client_id`/`client_secret`/`redirect_uris` → guardar. Repetir en categoría **conferencing** para **Google Meet** (usa las mismas credenciales; Meet depende de que Calendar esté conectado, no tiene OAuth propio).

**Por usuario:** Apps → Google Calendar → conectar cuenta propia → Apps → instalar Google Meet → en un event type ya aparece "Google Meet" como opción de ubicación.

`GOOGLE_WEBHOOK_TOKEN` (sync en tiempo real) es opcional, no se configura en esta fase — por default el sistema consulta disponibilidad on-demand, que alcanza para uso normal.

## Verificación end-to-end
- Reserva de prueba usando Google Meet como ubicación: llega el correo de confirmación (con el SMTP nuevo), con un link de Meet real, y el evento aparece en el Google Calendar del prestador conectado.
- La página de confirmación de reserva ya no dice "Cal Video" en ningún fallback.

## Estado al cierre de la sesión 2026-07-21

- ✅ Rename "Cal Video" → "Reunión online" — commiteado, build OK.
- ✅ Branding leaks adicionales (login, 404, Yahoo link, next-auth) — commiteados, build OK.
- ⏳ Confirmar que Dokploy ya tiene desplegada la imagen con ambos fixes (pedir Deploy si no se hizo).
- ✅ Resend configurado (API key + dominio verificado en Cloudflare/Resend).
- ⏳ **Primer paso de mañana**: confirmar en el log de Resend si el correo de confirmación al invitado (`cgomez.adolfo@gmail.com`) se envió — ver sección de arriba.
- ⏳ Setear `NEXT_PUBLIC_WEBSITE_URL` en Dokploy.
- ⏳ Google Calendar + Google Meet — investigación y pasos ya documentados arriba, nada ejecutado todavía (falta que el usuario arme el proyecto en Google Cloud Console).
- ⏳ El error "no pudimos agregar el enlace de dailyvideo" al agendar es **esperado** hasta que se configure Google Meet — no tocar aparte, se resuelve solo al completar esta fase.

## Pendientes conocidos
- Confirmar entrega real del correo al invitado (Gmail) — ver arriba, primer paso de la próxima sesión.
- Confirmar si el OAuth consent screen de Google debe ser Internal (solo systemlabs.cl) o External (si se espera que prestadores externos usen la plataforma con sus propias cuentas de Google).
- `GOOGLE_WEBHOOK_TOKEN` / sync en tiempo real — evaluar más adelante si el polling on-demand no alcanza.
- Considerar agregar un registro DMARC en `systemlabs.cl` (buena práctica para entregabilidad en Gmail, Resend puede sugerir el valor) — no bloqueante, evaluar según cómo salga la prueba de entrega de arriba.
