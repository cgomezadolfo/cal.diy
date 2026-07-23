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

**Resuelto — era la tercera opción.** Revisando el "All Emails" completo de Resend (no un filtro), se confirmó que **nunca se intentaba** mandar nada a los invitados (Gmail) — cero intentos, no era un tema de spam/entregabilidad. Encontramos y arreglamos dos bugs reales de código (ver "Bugs encontrados y arreglados" abajo).

**Nota sobre el correo de "problema al agregar enlace de video":** los primeros logs de Resend que se revisaron eran ese correo (`packages/emails/templates/broken-integration-email.ts`, `toAddresses = [this.calEvent.organizer.email]`) — confirmado que **solo va al organizador**, nunca a los invitados. No hay que confundirlo con la confirmación real de la reserva.

## Bugs encontrados y arreglados (probando el flujo real)

### 1. La confirmación de reserva no se mandaba a NADIE cuando fallaba una integración
**Commit:** `fix: send booking confirmation emails even when integrations fail`.

**Causa:** en `packages/features/bookings/lib/service/RegularBookingService.ts` (~línea 2064), el código chequeaba `results.every((res) => !res.success)` (¿fallaron TODAS las integraciones — video/calendario/CRM?) y, si era así, solo logueaba el error y **saltaba por completo** el bloque que manda el correo de confirmación (`emailsAndSmsHandler.send({ action: BookingActionMap.confirmed, ... })`) — ni organizador ni invitados lo recibían. Como en esta instancia no hay Google Calendar conectado todavía y el video (Daily/"Reunión online") falla sin `DAILY_API_KEY`, el único resultado de integración es ese fallo de video → `results.every(...)` daba `true` siempre → nunca se mandaba la confirmación real.

**Fix:** se sacó el `else` que anidaba el envío de emails dentro de la condición de éxito — ahora la confirmación se manda siempre que la reserva se creó en la BD, independiente de si las integraciones (video/calendario) fallaron. El aviso de integración rota se sigue mandando aparte al organizador, sin cambios.

**Confirmado con una reserva de prueba real:** después de este fix, tanto organizador como invitado recibieron su copia de la confirmación.

### 2. Los invitados recibían el correo en inglés por defecto
**Commit:** `fix: default guest/attendee emails to Spanish instead of English`.

**Causa doble:**
- En el mismo archivo, los invitados **adicionales** (no el que reserva directamente) tenían el idioma **hardcodeado a `"en"`** sin importar nada — el código ya tenía un comentario `// Why are we only using "en" locale` marcando esto como sospechoso.
- El default de idioma de toda la instancia (`packages/i18n/next-i18next.config.js`, `defaultLocale`/`fallbackLng`) heredaba `i18n.locale.source` = `"en"` — cuando el navegador del paciente no manda un `Accept-Language` reconocible, caía a inglés.

**Fix:** los invitados adicionales ahora usan el mismo idioma detectado que el invitado principal (`attendeeLanguage`) en vez de `"en"` fijo; y el default de la instancia pasó a `"es"` (se dejó `i18n.json`'s `locale.source` en `"en"` sin tocar, porque ese es el idioma de referencia del pipeline de traducción lingo.dev, un concepto distinto). Se actualizó también el test `next-i18next.config.test.ts` que afirmaba `"en"` como default.

**⚠️ Sin confirmar todavía / duda abierta:** en la prueba post-fix, el correo del invitado **seguía en inglés**. Dos hipótesis sin resolver al cierre de esta sesión:
1. No se le dio "Deploy" en Dokploy antes de probar (quedaría corriendo la imagen vieja).
2. Nuestro fix solo cambia el **fallback** (cuando no hay señal de idioma). Si quien hizo la prueba tenía el navegador/SO en inglés, el `Accept-Language: en` real se sigue respetando — no es un bug, es la app honrando una preferencia real del visitante.

Si es el caso 2, hay una decisión de producto pendiente: ¿la confirmación de reserva debería ser **siempre en español** sin importar el idioma del navegador del paciente (dado que el público son pacientes en Chile), o respetar la preferencia real del navegador como hace ahora? Si se quiere forzar español siempre, el fix es distinto (forzar `language: "es"` en el envío del formulario de reserva en vez de solo cambiar el fallback).

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

## Estado al cierre de la sesión 2026-07-23

- ✅ Rename "Cal Video" → "Reunión online" — commiteado, build OK.
- ✅ Branding leaks adicionales (login, 404, Yahoo link, next-auth) — commiteados, build OK.
- ✅ Resend configurado (API key + dominio verificado en Cloudflare/Resend), confirmado funcionando.
- ✅ **Bug grande arreglado**: la confirmación de reserva no se mandaba a nadie cuando fallaba una integración (ver "Bugs encontrados y arreglados" arriba) — confirmado resuelto con una reserva de prueba real, tanto organizador como invitado recibieron su copia.
- 🔧 **Bug de idioma parcialmente arreglado**: invitados adicionales ya no fuerzan `"en"`, default de la instancia pasa a español — pero en la prueba post-fix el invitado seguía recibiendo el correo en inglés. **Primer paso de la próxima sesión**: confirmar si fue por falta de Deploy en Dokploy, o porque el navegador de la prueba tenía idioma inglés (en cuyo caso no es bug, y hay que decidir si se quiere forzar español siempre — ver arriba).
- ⏳ Setear `NEXT_PUBLIC_WEBSITE_URL` en Dokploy — sigue pendiente.
- ⏳ Google Calendar + Google Meet — investigación y pasos ya documentados arriba, nada ejecutado todavía (falta que el usuario arme el proyecto en Google Cloud Console).
- ⏳ El error "no pudimos agregar el enlace de dailyvideo" al agendar sigue **esperado** hasta que se configure Google Meet.

## Pendientes conocidos
- Resolver la duda del idioma del invitado (ver arriba) — primer paso de la próxima sesión.
- Confirmar si el OAuth consent screen de Google debe ser Internal (solo systemlabs.cl) o External (si se espera que prestadores externos usen la plataforma con sus propias cuentas de Google).
- `GOOGLE_WEBHOOK_TOKEN` / sync en tiempo real — evaluar más adelante si el polling on-demand no alcanza.
- Considerar agregar un registro DMARC en `systemlabs.cl` (buena práctica para entregabilidad en Gmail, Resend puede sugerir el valor) — no bloqueante.
- Decisión de producto pendiente: ¿forzar español siempre en confirmaciones de reserva, o respetar el idioma del navegador del paciente? (ver bug #2 arriba)
