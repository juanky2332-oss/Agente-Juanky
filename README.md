# Panel de Juanky

App web (Next.js 16) que acompaña al asistente de Telegram **MULTIAGENTE JUANKY** (n8n).
Lee y escribe **las mismas hojas de Google** que el bot, así que todo está sincronizado:
lo que apuntas en Telegram sale aquí y al revés.

## Módulos
- **Gastos** (el foco): gráficas por mes y categoría, pagos fijos detectados, factura a factura,
  análisis automático (importes que no cuadran, duplicados, subidas, comparación con precios de
  mercado de la pestaña *Referencias precios*) y análisis a fondo con IA. Subida de facturas
  (foto/PDF) con lectura automática de kWh, potencia, tarifa y cargos extra.
- **Ingresos**: taller y Flownexion (con «marcar cobrado» que respeta las fórmulas de la hoja).
- **Tareas**, **Agenda** (Google Calendar), **Asistente** (el mismo agente y la misma memoria),
  **Contactos/proveedores**, **Gastro**, **Bebé**, **Correo** y **Sistema**.

## Arquitectura
`App (Vercel)` → webhook `app-juanky-api` del workflow n8n **API APP JUANKY (dashboard)**
(`Pw3b7KyPHAW0gk52`) → Google Sheets / Calendar / Drive / OpenAI / Telegram con las credenciales
que ya tiene n8n. La app nunca ve esas credenciales. El chat usa la entrada `app-juanky-chat`
del propio multiagente.

Regla de la casa: **las cifras las calcula el código** (`src/lib/finanzas.ts`,
`src/lib/trabajos.ts`); la IA solo redacta sobre ellas.

## Variables de entorno
| Variable | Qué es |
|---|---|
| `N8N_BASE_URL` | `https://paneln8n.transformaconia.com` |
| `N8N_APP_KEY` | clave compartida con el nodo *Validar* del workflow de la API |
| `APP_PASSWORD` | contraseña de entrada al panel |
| `AUTH_SECRET` | secreto para firmar la cookie de sesión (32+ caracteres) |

## Desarrollo
```bash
npm install
npm run dev
```
