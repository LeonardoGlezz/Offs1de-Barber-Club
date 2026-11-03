# PWA de reservas

Vite + TypeScript, sin framework. Se instala en el celular desde el navegador ("Agregar a pantalla de inicio").

| Ruta | Pantalla |
| --- | --- |
| `#/` | Reservar: barbero, servicio, día, hora y datos |
| `#/cita/<token>` | Ver la cita, agregarla al calendario o cancelarla |
| `#/barbero` | Panel del barbero con PIN: agenda, crear, editar, mover, cancelar, bloquear y avisar por WhatsApp |

`src/api/` es el único lugar que habla con el backend; para migrar a Supabase solo cambia ahí.

## Correr en local

```
cd apps/web
npm install
npm run dev
```

Sin `VITE_API_URL` la app corre en **modo demo**: guarda las citas en el navegador y simula la API (PIN 1111 Kevin, 2222 Olanda, 9999 dueño). Sirve para probar el flujo y presentarlo sin desplegar nada.

Para usar la API real, copia `.env.example` a `.env` y pon la URL `/exec` de Apps Script.

## Publicar

`.github/workflows/pages.yml` publica en GitHub Pages cada vez que cambia `main`. Hay que activar Pages una vez (Settings > Pages > Source: GitHub Actions) y, para salir del modo demo, crear la variable de repositorio `VITE_API_URL`.

## Pendiente

- Logo real: sustituir `public/logo.svg` y regenerar íconos con `node scripts/icons.cjs` (requiere Playwright).
- Recordatorios Web Push (rama `feature/reminders-push`).
