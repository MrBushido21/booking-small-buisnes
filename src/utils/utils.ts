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