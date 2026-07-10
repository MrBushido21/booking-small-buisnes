import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// Хеширование пароля
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Сравнение пароля с хешем
export async function matchPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function atTime(day: Date, hhmm: string): Date {
      const [h, m] = hhmm.split(':').map(Number);
      const d = new Date(day);
      d.setUTCHours(h, m, 0, 0);
      return d;
    }

export const dayWeek = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
} as const;

export function addMinutes(time: string, duration: number, minus?:"yes"): string {
  const [h, m] = time.split(':').map(Number);
  const total = minus ? h * 60 + m - duration : h * 60 + m + duration;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export const toStr = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));