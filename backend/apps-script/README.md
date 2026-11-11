# API en Apps Script

Backend del MVP. Usa la hoja de cálculo como base de datos y Google Calendar como agenda del barbero. Contrato en [`docs/api.md`](../../docs/api.md).

| Archivo | Qué hace |
| --- | --- |
| `Api.js` | `doPost`, enrutador de acciones y acciones públicas (reservar, consultar, cancelar) |
| `Admin.js` | Panel del barbero: PIN, listar, crear, editar, mover, cancelar, bloquear |
| `Calendar.js` | Crea, mueve y borra el evento de cada cita |
| `Data.js` | Lectura y escritura de las hojas |
| `Core.js` | Lógica pura (horarios, validaciones, mensajes); se prueba con Node |
| `Setup.js` | `setup()` crea las hojas con datos de ejemplo |

## Instalación

Guía paso a paso para la entrega: [`docs/entrega-mvp.md`](../../docs/entrega-mvp.md). Lo más rápido es pegar `dist/Codigo.gs` (todos los archivos en uno, se genera con `npm run bundle`).

### Archivo por archivo (alternativa)

1. Crea una hoja de cálculo nueva en Google Drive con la cuenta de la barbería.
2. **Extensiones > Apps Script.** Crea un archivo por cada `.js` de esta carpeta y pega su contenido. En **Configuración del proyecto** activa "Mostrar el archivo de manifiesto" y pega `appsscript.json`.
3. Ejecuta `setup` una vez y acepta los permisos. En el registro aparece el PIN del dueño.
4. Edita las hojas `Barberos`, `Servicios`, `Horario` y `Ajustes` con los datos reales. En `Barberos.calendarId` pon el ID del calendario de cada barbero (Configuración del calendario > Integrar el calendario) o deja `default` para usar el calendario de la cuenta. Comparte cada calendario con el barbero para que lo vea en su celular.
5. **Implementar > Nueva implementación > Aplicación web**, ejecutar como "Yo" y acceso "Cualquier persona". Copia la URL `/exec`: es la que usa la PWA.
6. Cada cambio de código requiere **Implementar > Gestionar implementaciones > Editar > Nueva versión** para que la URL lo sirva.

Con [clasp](https://github.com/google/clasp) los pasos 2 y 6 se hacen con `clasp push` y `clasp deploy`. El archivo `.clasp.json` no se sube al repo.

## Pruebas

```
npm test
```

Corre la lógica pura y un flujo de punta a punta con Sheets y Calendar simulados en memoria. No sustituye una prueba real en Apps Script después de desplegar.
