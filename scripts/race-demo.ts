/**
 * Демонстрация защиты от гонки (race condition) на уровне БД.
 *
 * Запуск:  npx ts-node scripts/race-demo.ts
 *
 * Что делает: берёт первого попавшегося мастера и ОДНОВРЕМЕННО (Promise.allSettled)
 * вставляет две пересекающиеся по времени confirmed-брони на далёкое будущее.
 * EXCLUDE-constraint "no_overlap" не даст вставить обе → одна вставка падает с 23P01.
 * В конце тестовые брони удаляются.
 */
import AppDataSource from '../src/data-source';

async function insertBooking(masterId: string, startISO: string, endISO: string, label: string) {
  // отдельный ds.query = отдельное соединение из пула = параллельная транзакция
  await AppDataSource.query(
    `INSERT INTO booking_entity
       (service_name, service_id, starts_at, ends_at, status, client_name, client_phone, master_id)
     VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7)`,
    ['RACE-DEMO', 'race-demo', startISO, endISO, label, '+000', masterId],
  );
}

async function main() {
  await AppDataSource.initialize();

  const rows: Array<{ id: string }> = await AppDataSource.query(`SELECT id FROM master_entity LIMIT 1`);
  if (rows.length === 0) {
    console.log('❌ В базе нет ни одного мастера — сначала создай мастера, потом запусти демо.');
    await AppDataSource.destroy();
    return;
  }
  const masterId = rows[0].id;
  console.log(`▶  Мастер: ${masterId}`);
  console.log('▶  Стреляем ДВЕ пересекающиеся брони одновременно (10:00–11:00 и 10:30–11:30)\n');

  // A: 10:00–11:00, B: 10:30–11:30 — пересекаются
  const results = await Promise.allSettled([
    insertBooking(masterId, '2035-01-01T10:00:00Z', '2035-01-01T11:00:00Z', 'A'),
    insertBooking(masterId, '2035-01-01T10:30:00Z', '2035-01-01T11:30:00Z', 'B'),
  ]);

  results.forEach((r, i) => {
    const name = i === 0 ? 'Бронь A (10:00–11:00)' : 'Бронь B (10:30–11:30)';
    if (r.status === 'fulfilled') {
      console.log(`✅ ${name}: вставлена`);
    } else {
      const code = r.reason?.code;
      console.log(`⛔ ${name}: ОТКЛОНЕНА базой  code=${code}  (${r.reason?.detail ?? r.reason?.message})`);
      if (code === '23P01' || code === '40P01') {
        const kind = code === '23P01' ? 'exclusion_violation' : 'deadlock (одновременная вставка)';
        console.log(`   ↑ ${kind} → в сервисе ловится и превращается в 409 ConflictException`);
      }
    }
  });

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - ok;
  console.log(`\nИтог: вставлено ${ok}, отклонено ${failed}. Гонка невозможна — база пропустила ровно одну бронь.`);

  // уборка
  await AppDataSource.query(`DELETE FROM booking_entity WHERE service_id = 'race-demo'`);
  console.log('🧹 Тестовые брони удалены.');

  await AppDataSource.destroy();
}

main().catch(async (e) => {
  console.error('Ошибка демо:', e);
  await AppDataSource.destroy().catch(() => {});
  process.exit(1);
});
