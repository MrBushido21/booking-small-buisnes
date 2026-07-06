import { registerDecorator, ValidationOptions } from 'class-validator';
import { DateTime } from 'luxon';

/**
 * Проверяет, что строка — валидная IANA-таймзона ('Europe/Kyiv', 'Asia/Shanghai').
 * Опечатки ('Europe/Moskva') и смещения ('+03:00') → ошибка валидации.
 */
export function IsTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          // запрещаем фиксированные смещения ('+03:00'): они не знают про переход
          // на летнее время → та самая DST-мина. Нужны только IANA-имена.
          if (/^[+-]\d{2}:?\d{2}$/.test(value.trim())) return false;
          return DateTime.local().setZone(value).isValid;
        },
        defaultMessage() {
          return `${propertyName} должна быть валидной IANA-таймзоной (напр. Europe/Kyiv)`;
        },
      },
    });
  };
}
