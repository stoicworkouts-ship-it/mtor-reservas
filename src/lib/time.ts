// Todas las fechas se muestran en hora de Chile, sin importar la zona
// horaria del servidor (Vercel corre en UTC) ni la del teléfono.
export const TZ = "America/Santiago";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "YYYY-MM-DD" del día en Chile.
export function chileDayKey(date: Date | string): string {
  return dayKeyFormat.format(new Date(date));
}

// "HH:MM" en Chile.
export function chileTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// Día de la semana (0 = domingo), día del mes y mes (0 = enero) de una clave "YYYY-MM-DD".
export function dayKeyParts(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return { weekday: date.getUTCDay(), day: d, month: m - 1 };
}

// Suma días a una clave "YYYY-MM-DD".
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Lunes de la semana de una clave "YYYY-MM-DD".
export function mondayOf(key: string): string {
  return addDays(key, -((dayKeyParts(key).weekday + 6) % 7));
}
