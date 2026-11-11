# Entrega del MVP: de demo a sistema real en la nube

Tiempo estimado: 30 minutos. Todo es gratis. Se hace una sola vez.

Al terminar, la PWA vive en `https://leonardoglezz.github.io/Offs1de-Barber-Club/`, las citas se guardan en una hoja de Google, aparecen en el Google Calendar de cada barbero y el panel del barbero las ve todas.

## 1. Publicar la PWA (5 min)

GitHub Pages gratis requiere que el repo sea público (no contiene contraseñas ni datos privados).

1. Repo > **Settings > General > Danger Zone > Change repository visibility > Change to public**.
2. Repo > **Settings > Pages > Source: GitHub Actions**.
3. **Actions > Publicar PWA en GitHub Pages > Run workflow** (rama `main`).
4. En 1 o 2 minutos abre `https://leonardoglezz.github.io/Offs1de-Barber-Club/`. Debe verse en **modo demo** (letrero punteado arriba).

Cada push a `main` que toque `apps/web` vuelve a publicar solo.

> Alternativa con el repo privado: Netlify (gratis) usa el `netlify.toml` del repo. *Add new project > Import from GitHub*, rama `main`, Deploy; la variable `VITE_API_URL` va en *Site configuration > Environment variables*.

## 2. Instalar la API en Google (15 min)

Usa la cuenta de Google de la barbería: ahí quedan la hoja y los calendarios.

1. En [Google Sheets](https://sheets.new) crea una hoja nueva y nómbrala `Offs1de Reservas`.
2. **Extensiones > Apps Script**. Se abre el editor con un archivo `Código.gs`.
3. Borra su contenido y pega **todo** el archivo [`backend/apps-script/dist/Codigo.gs`](../backend/apps-script/dist/Codigo.gs) (en GitHub, botón **Raw**, Ctrl+A, Ctrl+C).
4. **Configuración del proyecto** (engrane) > activa **Mostrar el archivo de manifiesto "appsscript.json"**. Vuelve al editor, abre `appsscript.json` y reemplázalo con [`backend/apps-script/appsscript.json`](../backend/apps-script/appsscript.json).
5. Guarda (Ctrl+S). Arriba, en el selector de funciones, elige **`setup`** y presiona **Ejecutar**.
6. Google pedirá permisos: **Revisar permisos > tu cuenta > Configuración avanzada > Ir a (no seguro) > Permitir**. Es normal: el script es tuyo y no está publicado en la tienda de Google.
7. En el **Registro de ejecución** aparece el **PIN del dueño** (6 dígitos). Anótalo.

`setup` crea las hojas `Citas`, `Barberos`, `Servicios`, `Horario`, `Bloqueos` y `Ajustes`, y un calendario **"Offs1de · Kevin"** y otro **"Offs1de · Olanda"**.

## 3. Ajustar datos del negocio (5 min, en la hoja)

| Hoja | Qué revisar |
| --- | --- |
| `Barberos` | Nombres y **PIN** de cada barbero (cámbialos, 1111 y 2222 son de ejemplo) |
| `Servicios` | Nombres, **duración en minutos** y precio |
| `Horario` | Horario por día (0 = domingo). Sin hora de apertura = cerrado |
| `Ajustes` | `urlPublica` ya trae la URL de GitHub Pages. `mapsUrl`: enlace de Google Maps de la barbería |

Los cambios en la hoja se aplican de inmediato, sin volver a desplegar.

Para que cada barbero vea su agenda en el celular: en [Google Calendar](https://calendar.google.com) > calendario "Offs1de · Kevin" > **Configuración y uso compartido > Compartir con personas** > agrega el Gmail del barbero con permiso **Hacer cambios en eventos**. Igual con Olanda.

## 4. Desplegar la API y conectarla (5 min)

1. En el editor de Apps Script: **Implementar > Nueva implementación > tipo: Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
2. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
3. Prueba: abre esa URL en el navegador. Debe mostrar `{"ok":true,...}`.
4. GitHub > repo > **Settings > Secrets and variables > Actions > pestaña Variables > New repository variable** (o cambia `API_URL` al inicio de `.github/workflows/pages.yml`, que se usa si la variable no existe):
   - Name: `VITE_API_URL`
   - Value: la URL `/exec`
5. **Actions > Publicar PWA en GitHub Pages > Run workflow**.

Cuando termine, el letrero de modo demo desaparece: ya está conectada.

## 5. Prueba final (5 min)

- [ ] Desde un celular, reservar una cita.
- [ ] La cita aparece en la hoja `Citas` y en el calendario del barbero.
- [ ] Abrir `/#/barbero` con el PIN del barbero, mover la cita: se mueve en Calendar y aparece el botón de WhatsApp.
- [ ] Desde el enlace de la cita, cancelarla: desaparece del calendario.
- [ ] En el iPhone/Android: "Agregar a pantalla de inicio" para instalarla como app.

## Si cambias el código de la API

Edita `backend/apps-script/*.js`, corre `npm run bundle`, pega de nuevo `dist/Codigo.gs` y en Apps Script **Implementar > Gestionar implementaciones > editar (lápiz) > Versión: Nueva versión > Implementar**. La URL no cambia.

## Problemas comunes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| "Error interno" al reservar | Falta ejecutar `setup` o los permisos | Ejecuta `setup` y acepta permisos |
| No aparecen eventos | El ID de calendario en `Barberos` no existe | Vuelve a poner `nuevo` y ejecuta `setup` |
| Cambié el código y no se ve | No se creó una versión nueva | Gestionar implementaciones > Nueva versión |
| Sigue en modo demo | Falta la variable o volver a publicar | Revisa `VITE_API_URL` y corre el workflow de Pages |
| El enlace de la cita no abre | `urlPublica` vacía o con otra URL | Pon la URL del sitio en `Ajustes` |
