/**
 * Prepara la hoja de cálculo. Ejecútalo una vez desde el editor de Apps Script (Ejecutar > setup).
 * No borra datos: solo crea las hojas que falten y agrega datos de ejemplo a las que estén vacías.
 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const samples = {
    Barberos: [
      ['kevin', 'Kevin', 'default', '1111', '', 'si'],
      ['olanda', 'Olanda', 'default', '2222', '', 'si'],
    ],
    // Duraciones de ejemplo: confirmar con la barbería.
    Servicios: [
      ['clasico', 'Corte clásico', '60', '', 'si'],
      ['barba', 'Barba', '60', '', 'si'],
      ['combo', 'Combo corte + barba', '60', '', 'si'],
    ],
    // dia: 0 = domingo ... 6 = sábado. Sin hora de apertura = cerrado.
    Horario: [
      ['0', '', '', '', ''],
      ['1', '10:00', '20:00', '14:00', '16:00'],
      ['2', '10:00', '20:00', '14:00', '16:00'],
      ['3', '10:00', '20:00', '14:00', '16:00'],
      ['4', '10:00', '20:00', '14:00', '16:00'],
      ['5', '10:00', '20:00', '14:00', '16:00'],
      ['6', '10:00', '20:00', '14:00', '16:00'],
    ],
    Ajustes: [
      ['negocio', 'Offs1de Barber Club'],
      ['urlPublica', ''],
      ['intervaloMin', '60'],
      ['diasMaxAnticipacion', '30'],
      ['minMinutosAntes', '120'],
      ['maxCitasPorTelefono', '2'],
      ['mapsUrl', ''],
    ],
  };

  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = HEADERS[name];
    // Todo como texto para que Sheets no convierta fechas, horas ni PINs con ceros.
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      const rows = samples[name];
      if (rows) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('OWNER_PIN')) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty('OWNER_PIN', pin);
    console.log('PIN del dueño generado: ' + pin + ' (cámbialo en Configuración del proyecto > Propiedades del script).');
  }
  console.log('Listo. Revisa las hojas Barberos, Servicios, Horario y Ajustes.');
}
