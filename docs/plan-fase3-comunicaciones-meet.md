# Fase 3: Correos transaccionales + Google Meet/Calendar

## Contexto

Usando la app como lo haría un paciente real, aparecieron dos huecos funcionales que dejaban el sistema inutilizable en la práctica: no salían correos de confirmación (sin SMTP configurado) y la ubicación de reunión por defecto ("Cal Video") no genera links reales porque nunca se configuró Daily.co. Se decidió reemplazar Cal Video por **Google Meet** como ubicación principal y configurar un SMTP transaccional real.

Investigación completa hecha con subagentes de exploración antes de tocar código — ver decisiones abajo.

## Cambios de código aplicados (rama `agenda`)

**Rename "Cal Video" → "Reunión online".** El string está hardcodeado en dos lugares (no es traducible por i18n, confirmado leyendo el código):
- `packages/app-store/dailyvideo/_metadata.ts` — `name`, `title`, `appData.location.label` (esto último es lo que se ve en la página de confirmación de reserva), `description`, `publisher`.
- `packages/lib/CalEventParser.ts` (función `getProviderName`, ~línea 204) — el mismo string pero usado en emails/ICS.

Se dejó como fallback rebautizado en vez de invertir en configurar Daily.co, porque Google Meet pasa a ser la ubicación principal.

## Configuración pendiente de ejecutar (requiere cuentas externas del usuario)

### SMTP transaccional
Proveedor a elegir (Resend / SendGrid / Brevo / SES — pendiente de decidir cuál exactamente y verificar el dominio `systemlabs.cl` en el proveedor). Variables a cargar en el panel Environment de Dokploy (nunca en el repo, mismo mecanismo de fase 1):
```
EMAIL_FROM=<remitente verificado en el proveedor>
EMAIL_FROM_NAME=Agenda Systemlabs
EMAIL_SERVER_HOST=<host smtp del proveedor>
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=<user o api key>
EMAIL_SERVER_PASSWORD=<password o api key>
```

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

## Estado
Cambios de código (rename) commiteados y pusheados a `agenda`. Configuración de SMTP y Google Cloud Console **pendiente de ejecutar** — requiere que el usuario cree/tenga a mano cuentas externas (proveedor SMTP, proyecto de Google Cloud). Se retoma en la próxima sesión de trabajo con esos datos a mano.

## Pendientes conocidos
- Decidir proveedor SMTP concreto y verificar `systemlabs.cl` en él.
- Confirmar si el OAuth consent screen de Google debe ser Internal (solo systemlabs.cl) o External (si se espera que prestadores externos usen la plataforma con sus propias cuentas de Google).
- `GOOGLE_WEBHOOK_TOKEN` / sync en tiempo real — evaluar más adelante si el polling on-demand no alcanza.
