// Tipos del contrato de la API (docs/api.md).

export interface Barber { id: string; name: string }
export interface Service { id: string; name: string; durationMin: number; price?: string }

export interface Config {
  business: string;
  mapsUrl: string;
  stepMin: number;
  maxDaysAhead: number;
  barbers: Barber[];
  services: Service[];
  closedDays: number[];
}

export type Status = 'Activa' | 'Cancelada' | 'Completada' | 'NoAsistio';

export interface PublicBooking {
  id: string;
  date: string;
  time: string;
  durationMin: number;
  barberName: string;
  serviceName: string;
  name: string;
  status: Status;
  manageUrl: string;
}

export interface AdminBooking extends PublicBooking {
  barberId: string;
  serviceId: string;
  phone: string;
  notes: string;
  inCalendar: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Block { id: string; barberId: string; date: string; from: string; to: string; reason: string }

export interface Notify { waUrl: string; message: string }

export interface AdminSession { role: 'owner' | 'barber'; barberId: string | null; name: string }

export interface AdminList {
  from: string;
  to: string;
  bookings: AdminBooking[];
  blocks: Block[];
  barbers: Barber[];
  services: Service[];
}

export interface BookingChanges {
  date?: string;
  time?: string;
  barberId?: string;
  serviceId?: string;
  name?: string;
  phone?: string;
  notes?: string;
}
