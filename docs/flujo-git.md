# Flujo de trabajo con Git

1. Actualiza `develop`: `git checkout develop && git pull`.
2. Crea tu rama: `git checkout -b feature/<nombre-corto>`.
3. Commits pequeños con mensajes en imperativo (`Agrega cancelación por token`).
4. Abre un PR hacia `develop`. Se fusiona cuando pasa la revisión.
5. Para publicar, se abre un PR de `develop` a `main`.

Ramas previstas:

| Rama | Contenido |
| --- | --- |
| `feature/apps-script-api` | API: disponibilidad, reservas, cancelación y CRUD del barbero sincronizado con Calendar |
| `feature/pwa-shell` | Esqueleto de la PWA: manifest, service worker, íconos, tema |
| `feature/booking-flow` | Pantallas de reserva del cliente |
| `feature/cancel-by-link` | Página `/cita/<token>` para ver o cancelar |
| `feature/barber-panel` | Panel del barbero: agenda, editar, mover, cancelar, avisar |
| `feature/reminders-push` | Recordatorios Web Push 24 h y 1 h antes |
