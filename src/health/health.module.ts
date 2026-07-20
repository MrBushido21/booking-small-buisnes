import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// DataSource (TypeOrmModule.forRoot) и 'REDIS' (RedisModule) — глобальные,
// поэтому импортировать тут нечего.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
