# Offs1de Barber Club · Reservas

PWA de reservas para la barbería **Offs1de Barber Club** (temática de fútbol). El cliente agenda y cancela sin cuenta ni correo; el barbero ve y administra sus citas, y todo se refleja en Google Calendar.

> Estado: MVP en construcción. El flujo de trabajo con el cliente aún se está validando, así que la arquitectura está pensada para iterar rápido.

## Arquitectura (MVP)

| Pieza | Tecnología | Costo |
| --- | --- | --- |
| Frontend | PWA estática (Vite + TypeScript) en GitHub Pages | Gratis |
| API | Google Apps Script publicado como Web App | Gratis |
| Base de datos | Google Sheets | Gratis |
| Agenda del barbero | Google Calendar (un calendario por barbero) | Gratis |
| Recordatorios | `.ics` con alarmas, enlace a Google Calendar, Web Push (FCM), enlaces wa.me | Gratis |

Más adelante, para venderlo a varias barberías, el backend migra a Supabase. El frontend solo habla con `apps/web/src/api/`, así que la migración no toca la interfaz.

**Para publicar el sistema real:** [`docs/entrega-mvp.md`](docs/entrega-mvp.md).

Detalles en [`docs/arquitectura.md`](docs/arquitectura.md) y el contrato de la API en [`docs/api.md`](docs/api.md).

## Estructura

```
apps/web/              PWA (cliente y panel del barbero)
backend/apps-script/   Código de Apps Script (se despliega con clasp)
docs/                  Arquitectura, API, flujo de trabajo
legacy/                HTML original, solo como referencia visual
```

## Ramas

- `main`: producción. Solo recibe PRs desde `develop`.
- `develop`: integración. Cada feature entra por PR.
- `feature/<nombre>`: una por funcionalidad, sale de `develop`.
- `fix/<nombre>`: correcciones, sale de `develop` (o de `main` si es urgente).

Ver [`docs/flujo-git.md`](docs/flujo-git.md).
