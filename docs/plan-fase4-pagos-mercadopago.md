# Fase 4: Pagos por reserva (Mercado Pago) — planificada, no ejecutada

## Contexto y decisión de negocio

Los usuarios de Agenda son prestadores de salud (médicos/psicólogos) que cobran a sus pacientes por la consulta reservada. Se evaluaron dos modelos:

1. **Marketplace con retención** (tipo MercadoLibre: la plata pasa por Agenda, se retiene unos días, se libera al prestador, Agenda cobra comisión automática). Descartado por ahora: convierte a Agenda en intermediario de fondos, lo que implica regulación de medios de pago y responsabilidad sobre plata de terceros en Chile.
2. **Cada prestador conecta su propia cuenta** (elegido). El paciente paga directo a la cuenta de Mercado Pago del prestador; Agenda nunca toca el dinero. La monetización de Agenda (arriendo/suscripción a los prestadores) queda completamente separada de este flujo — es un tema de facturación B2B aparte, no de este documento.

**Pasarela elegida:** Mercado Pago (Checkout Pro), por ser self-service en Chile (el prestador crea su cuenta y genera su access token sin depender de un contrato comercial, a diferencia de Transbank/Webpay directo) y tener buena documentación de API.

**Sin comisión automática por reserva** — 100% del pago va al prestador. Si en el futuro se quiere cobrar comisión, el camino sería migrar a Mercado Pago vía OAuth de marketplace (cada prestador conecta contra una aplicación registrada por Agenda, y MP descuenta la comisión automáticamente sin que la plata pase por nosotros) — no se diseñó en detalle porque no es la prioridad actual, pero el modelo de credenciales por usuario que se plantea abajo no lo bloquea a futuro.

## Hallazgo crítico: los pagos están rotos hoy, para CUALQUIER pasarela

`apps/web/app/(use-page-wrapper)/payment/[uid]/page.tsx` (líneas 61-86) tiene el cargador de datos (`getData`) **stubbeado** — devuelve un objeto vacío hardcodeado en vez de consultar la reserva/pago real:
```ts
const getData = withAppDirSsr<PaymentPageProps>(async () => ({
  props: {
    payment: { id: 0, success: false, ..., data: {}, appId: null },
    booking: { id: 0, uid: "", ... },
    ...
  },
}));
```
Se perdió junto con el código `packages/features/ee/` que cal.diy eliminó del fork. **Consecuencia: ni siquiera PayPal funciona hoy**, aunque se le configuren credenciales completas — el paciente llegaría a una página de pago vacía sin datos de la reserva.

Esto es la primera tarea obligatoria de la fase 4, independiente de qué pasarela se use al final:
- Restaurar el loader real usando `packages/prisma/selects/payment.ts` (`paymentDataSelect`, ya trae `appId`, `data`, booking, eventType, users, team).
- Base recuperable del historial: `git show 76bba1ca05:packages/features/ee/payments/pages/payment.tsx` — adaptar quitando lo específico de Stripe (`clientSecret`) y recalculando `hideBranding` desde los campos del select en vez del helper `shouldHideBrandingForEvent` que ya no existe en `packages/lib`.

## Arquitectura de la app Mercado Pago (Checkout Pro)

El motor genérico de pagos por reserva está intacto en este fork (confirmado leyendo código):
- `packages/features/bookings/lib/service/RegularBookingService.ts` (líneas 663-716) — calcula `paymentAppData`, mantiene la reserva sin confirmar, llama a `handlePayment`.
- `packages/features/bookings/lib/handlePayment.ts` — resuelve el `PaymentService` de la app instalada vía `PaymentServiceMap` (`packages/app-store/payment.services.generated.ts`).
- `packages/app-store/_utils/payments/handlePaymentSuccess.ts` — al confirmarse el pago, marca la reserva como pagada/aceptada, crea el evento de calendario, dispara los correos. Firma actual: `handlePaymentSuccess({ paymentId, appSlug, bookingId, traceContext })`.

Se usó la app de **PayPal** (`packages/app-store/paypal/`) como plantilla porque ya implementa exactamente el patrón que queremos: cada usuario pega sus propias credenciales (sin OAuth de plataforma), webhook propio, componente de pago propio.

### Flujo de pago (Checkout Pro — redirección, no manejamos datos de tarjeta)
1. Prestador instala la app "Mercado Pago" → pantalla de Setup pide **Access Token** (obligatorio) y **Public Key** (opcional, para uso futuro con Bricks) de su propia cuenta MP.
2. Al reservar un evento con precio: `PaymentService.create()` crea una preferencia vía `POST https://api.mercadopago.com/checkout/preferences` (con el token del prestador), con:
   - `items` con `currency_id: "CLP"` y `unit_price` como **entero** (CLP no tiene decimales — usar la misma lista `zeroDecimalCurrencies` de `packages/lib/currencyConversions.ts` que ya maneja este caso).
   - `external_reference` = uid interno del pago.
   - `notification_url` → `https://agenda.systemlabs.cl/api/integrations/mercadopago/webhook?paymentUid=<uid>`.
   - `back_urls` → `https://agenda.systemlabs.cl/api/integrations/mercadopago/callback?paymentUid=<uid>`, `auto_return: "approved"`.
3. Paciente es redirigido a `init_point` (checkout de MP), paga con sus propios medios.
4. Webhook recibe la notificación → **nunca confía en el payload a ciegas**: vuelve a consultar `GET /v1/payments/{id}` a la API de MP con el token del prestador → si `approved` y coincide `external_reference`/monto, llama a `handlePaymentSuccess(...)`.
5. Callback de retorno (`api/callback.ts`) maneja el redirect del navegador del paciente de vuelta a la app (no debe ser la única fuente de verdad — el webhook es la autoritativa).
6. La plata la deposita Mercado Pago directo en la cuenta del prestador — Agenda no la toca en ningún momento.

### Archivos a crear (mismo patrón que `packages/app-store/paypal/`)
```
packages/app-store/mercadopago/
  config.json                              # metadata de la app (slug, categorías, etc.)
  zod.ts                                   # appDataSchema (price/currency/paymentOption), appKeysSchema vacío
  package.json, index.ts
  lib/MercadoPago.ts                       # cliente HTTP delgado (sin SDK), createPreference/getPayment/refundPayment/me
  lib/PaymentService.ts                    # create/refund/afterPayment — implementa la interfaz PaymentService
  lib/currencyOptions.ts                   # solo CLP
  lib/updateAppCredentials.validator.ts    # valida el token pegado llamando a GET /users/me de MP
  api/add.ts, api/webhook.ts, api/callback.ts, api/index.ts
  components/EventTypeAppCardInterface.tsx
  components/EventTypeAppSettingsInterface.tsx
  lib/PaymentService.test.ts, api/webhook.test.ts   # vitest

apps/web/
  components/apps/mercadopago/Setup.tsx
  components/apps/mercadopago/MercadoPagoPaymentComponent.tsx
  pages/api/integrations/mercadopago/webhook.ts     # re-export del handler de app-store
```

### Archivos existentes a tocar
- `apps/web/app/(use-page-wrapper)/payment/[uid]/page.tsx` — restaurar el loader (ver hallazgo crítico arriba).
- `apps/web/app/(use-page-wrapper)/payment/[uid]/PaymentPage.tsx` — nueva rama para renderizar `MercadoPagoPaymentComponent`.
- `apps/web/components/apps/AppSetupPage.tsx` — registrar `mercadopago` en `AppSetupMap`.
- `packages/trpc/server/routers/viewer/apps/updateAppCredentials.handler.ts` — registrar el validador de credenciales.
- `packages/i18n/locales/{en,es}/common.json` — strings nuevos (nombre de la app, instrucciones de setup, botón "Pagar con Mercado Pago").
- Regenerar archivos `*.generated.ts` de `packages/app-store/` con `yarn app-store:build` (no editar a mano).

### Alta de la app en la BD del deploy
El seeder (`scripts/seed-app-store.ts`) está deprecado y no corre en producción. Camino recomendado: una vez desplegado el código, un admin entra a `/settings/admin/apps` y activa "Mercado Pago" — esto crea la fila en la tabla `App` automáticamente (mismo mecanismo ya usado para Google Calendar en fase 3).

## Riesgos a verificar contra la documentación real de Mercado Pago Chile al implementar
- Si `notification_url` por preferencia conserva el query param propio (`paymentUid`) al recibir la notificación, o si hay que resolver el pago por `external_reference` en su lugar.
- Formato de `unit_price` para CLP — confirmar que la API rechaza decimales en vez de redondear silenciosamente.
- Comportamiento exacto de `auto_return: "approved"` y qué llega en los query params del redirect (`payment_id`, `collection_id`, `external_reference`, `status`).
- Si conviene `binary_mode: true` (simplifica el estado pero excluye medios de pago offline tipo Servipag que quedan en `pending`).
- Política de reintentos de notificación de MP — el webhook debe ser idempotente (chequear `payment.success` antes de reprocesar).
- Validación de firma `x-signature` — puede no estar disponible en notificaciones por preferencia (solo en webhooks configurados desde el dashboard); si no está disponible, la verificación por consulta directa a la API (paso 4 del flujo) es la que da la seguridad real, así que no bloquea el diseño.

## Secuenciación (PRs, respetando límites de <500 líneas / <10 archivos de CLAUDE.md)
1. **PR 1** — Restaurar el loader de `/payment/[uid]` (desbloquea PayPal hoy mismo, prerequisito de todo lo demás).
2. **PR 2** — Scaffold de la app `mercadopago`: `PaymentService`, cliente HTTP, validador de credenciales, archivos generados.
3. **PR 3** — Flujo de booking: webhook, callback, página de pago, UI de Setup.
4. **PR 4** — Tarjeta de event type, i18n, alta de la app en el deploy.

## Prerequisitos para ejecutar esta fase
- Cuenta propia de Mercado Pago (para conectarla como "prestador de prueba").
- Credenciales de test-user de Mercado Pago (para simular el pago de un paciente sin usar dinero real).
- Fase 3 completada (SMTP funcionando) — sin esto no se puede verificar el flujo completo, porque la confirmación de pago dispara el correo de confirmación de la reserva.

## Estado
Solo investigación y diseño — **no se escribió código todavía**. Se retoma cuando el usuario tenga las cuentas/credenciales de Mercado Pago mencionadas arriba.
