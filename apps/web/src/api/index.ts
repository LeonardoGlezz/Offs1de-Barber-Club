/**
 * Único punto de contacto con el backend. Para migrar a Supabase solo cambia este archivo.
 * Sin VITE_API_URL la app corre en modo demo con datos en el navegador (ver mock.ts).
 */
import type {
  AdminBooking, AdminList, AdminSession, Block, BookingChanges, Config, Notify, PublicBooking,
} from './types';
import { mockCall } from './mock';

export * from './types';

const API_URL: string | undefined = import.meta.env.VITE_API_URL;
export const isDemo = !API_URL;

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let json: { ok: boolean; data?: T; error?: { code: string; message: string } };
  if (!API_URL) {
    json = (await mockCall(action, params)) as typeof json;
  } else {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...params }),
      });
    } catch {
      throw new ApiError('network', 'Sin conexión. Revisa tu internet e intenta de nuevo.');
    }
    json = await res.json();
  }
  if (!json.ok) throw new ApiError(json.error?.code ?? 'internal', json.error?.message ?? 'Error inesperado.');
  return json.data as T;
}

export const api = {
  getConfig: () => call<Config>('getConfig'),
  getSlots: (barberId: string, serviceId: string, date: string) =>
    call<{ slots: string[] }>('getSlots', { barberId, serviceId, date }),
  book: (p: { barberId: string; serviceId: string; date: string; time: string; name: string; phone: string; website: string }) =>
    call<{ booking: PublicBooking; token: string }>('book', p),
  getBooking: (token: string) => call<{ booking: PublicBooking }>('getBooking', { token }),
  cancel: (token: string) => call<{ booking: PublicBooking }>('cancel', { token }),

  adminLogin: (pin: string) => call<AdminSession>('adminLogin', { pin }),
  adminList: (pin: string, from: string, to: string) => call<AdminList>('adminList', { pin, from, to }),
  adminCreate: (pin: string, p: { barberId: string; serviceId: string; date: string; time: string; name: string; phone?: string; notes?: string; force?: boolean }) =>
    call<{ booking: AdminBooking; notify: Notify | null }>('adminCreate', { pin, ...p }),
  adminUpdate: (pin: string, id: string, changes: BookingChanges, force = false) =>
    call<{ booking: AdminBooking; notify: Notify | null }>('adminUpdate', { pin, id, changes, force }),
  adminCancel: (pin: string, id: string, reason: string) =>
    call<{ booking: AdminBooking; notify: Notify | null }>('adminCancel', { pin, id, reason }),
  adminSetStatus: (pin: string, id: string, status: 'Completada' | 'NoAsistio') =>
    call<{ booking: AdminBooking }>('adminSetStatus', { pin, id, status }),
  adminBlock: (pin: string, p: { barberId: string; date: string; from: string; to: string; reason: string }) =>
    call<{ block: Block; conflicts: AdminBooking[] }>('adminBlock', { pin, ...p }),
  adminUnblock: (pin: string, blockId: string) => call<{ removed: string }>('adminUnblock', { pin, blockId }),
};
