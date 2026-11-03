/**
 * "Mis citas" sin cuenta: los tokens se guardan en este navegador para que el cliente vea
 * sus citas al volver. Si se borran los datos del navegador, el enlace del calendario sigue sirviendo.
 */
const KEY = 'offs1de-mis-citas';

interface Saved { token: string; date: string; time: string }

export function savedBookings(): Saved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Saved[];
  } catch {
    return [];
  }
}

export function rememberBooking(s: Saved) {
  const list = savedBookings().filter(x => x.token !== s.token);
  list.push(s);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-10))); } catch { /* sin almacenamiento */ }
}

export function forgetBooking(token: string) {
  try { localStorage.setItem(KEY, JSON.stringify(savedBookings().filter(x => x.token !== token))); } catch { /* sin almacenamiento */ }
}
