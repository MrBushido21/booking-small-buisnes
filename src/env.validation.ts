import { plainToInstance } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

class EnvVars {
  @IsString()
  POSTGRES_USER!: string;

  @IsString()
  POSTGRES_PASSWORD!: string;

  @IsString()
  POSTGRES_DB!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_ACCESS_SECRET слишком короткий (мин. 16 символов)' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_REFRESH_SECRET слишком короткий (мин. 16 символов)' })
  JWT_REFRESH_SECRET!: string;

  // необязательные — у них есть дефолты в коде
  @IsOptional()
  @IsNumber()
  PORT?: number;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

   @IsString()
  SMTP_HOST!: string;

  @IsNumber()
  SMTP_PORT!: number;

  @IsString()
  MAIL_FROM!: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Невалидные переменные окружения:\n${errors.toString()}`);
  }
  return validated;
}
