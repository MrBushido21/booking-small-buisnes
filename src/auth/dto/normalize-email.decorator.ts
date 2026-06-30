import { Transform } from 'class-transformer';

// Приводим email к канону на входе: обрезаем пробелы и в нижний регистр.
// Так "Test@Mail.com " и "test@mail.com" станут одной строкой — unique и логин работают корректно.
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
