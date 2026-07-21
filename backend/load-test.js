/**
 * Load Test: 1000 employees + hundreds of thousands of work sessions
 *
 * Measures: timing, memory consumption, SQLite performance, report generation.
 *
 * Run: node load-test.js
 * Requires: Prisma Client generated (npx prisma generate)
 */
const { PrismaClient } = require('@prisma/client');
const { performance } = require('perf_hooks');

const prisma = new PrismaClient({ log: [] });

const EMPLOYEE_COUNT = 1000;
const SESSIONS_PER_EMPLOYEE = 250;
const RAW_SQL_BATCH = 50;

function fmt(n) { return n.toLocaleString('es-CO'); }
function fmtMs(ms) { return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`; }
function fmtMB(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function mem() { return process.memoryUsage(); }

function randomDate(year, month) {
  const day = 1 + Math.floor(Math.random() * 28);
  const hour = 6 + Math.floor(Math.random() * 14);
  const minute = Math.floor(Math.random() * 60);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

function addHours(date, h) {
  return new Date(date.getTime() + h * 3600000);
}

function toSQLiteDate(d) {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

async function rawInsertSessions(rows) {
  if (rows.length === 0) return;
  const cols = [
    'empleado_id', 'inicio', 'fin', 'total_minutos', 'minutos_ordinarios',
    'minutos_recargo_nocturno', 'minutos_extra_diurna', 'minutos_extra_nocturna',
    'minutos_dominical', 'minutos_festivo', 'minutos_extra_festiva_diurna',
    'minutos_extra_festiva_nocturna', 'minutos_recargo_nocturno_dominical_festivo',
    'anulado', 'dia_descanso_trabajado', 'tipo_compensatorio', 'createdAt', 'updatedAt',
  ];
  const placeholder = `(${cols.map(() => '?').join(',')})`;
  const placeholders = rows.map(() => placeholder).join(',');
  const sql = `INSERT INTO jornadas (${cols.map(c => `"${c}"`).join(',')}) VALUES ${placeholders}`;
  const params = rows.flat();
  await prisma.$executeRawUnsafe(sql, ...params);
}

async function main() {
  console.log('=== LOAD TEST: Jornadas Laborales ===\n');
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 30000');
  const mem0 = mem();

  // ─── PHASE 1: Seed data ───────────────────────────────────────
  console.log('--- Phase 1: Create WorkConfig + Schedule ---');
  let t = performance.now();

  // Clean up any existing config/schedule with these names
  await prisma.$executeRawUnsafe(`DELETE FROM distribucion_ordinaria WHERE configuracion_id IN (SELECT id FROM configuracion_trabajo WHERE nombre = 'Config Carga')`);
  await prisma.$executeRawUnsafe(`DELETE FROM configuracion_trabajo WHERE nombre = 'Config Carga'`);
  await prisma.$executeRawUnsafe(`DELETE FROM horarios_diarios WHERE horario_id IN (SELECT id FROM horarios WHERE nombre = 'Horario Carga')`);
  await prisma.$executeRawUnsafe(`DELETE FROM horarios WHERE nombre = 'Horario Carga'`);

  const wc = await prisma.workConfig.create({
    data: {
      name: 'Config Carga',
      description: 'Jornada estandar 8h',
      modality: 'ADMINISTRATIVO',
      breakMinutes: 60,
      weeklyTargetMinutes: 2520,
    },
  });

  const sched = await prisma.schedule.create({
    data: {
      name: 'Horario Carga',
      startTime: '07:00',
      endTime: '17:00',
      workDays: '1,2,3,4,5',
      breakMinutes: 60,
    },
  });

  for (let dow = 1; dow <= 5; dow++) {
    await prisma.scheduleDay.create({
      data: { scheduleId: sched.id, dayOfWeek: dow, startTime: '07:00', endTime: '17:00', breakMinutes: 60 },
    });
  }

  console.log('  Created in ' + fmtMs(performance.now() - t));

  // ─── PHASE 0: Pre-cleanup stale data ──────────────────────────
  console.log('\n--- Phase 0: Pre-cleanup stale load-test data ---');
  t = performance.now();
  await prisma.$executeRawUnsafe(`DELETE FROM jornadas WHERE empleado_id IN (SELECT id FROM empleados WHERE numero_documento LIKE 'CARGA%')`);
  await prisma.$executeRawUnsafe(`DELETE FROM empleados WHERE numero_documento LIKE 'CARGA%'`);
  console.log(`  Pre-cleanup: ${fmtMs(performance.now() - t)}`);

  // ─── PHASE 2: Create 1000 employees ──────────────────────────
  console.log(`\n--- Phase 2: Create ${fmt(EMPLOYEE_COUNT)} employees ---`);
  t = performance.now();

  const empBatch = [];
  for (let i = 1; i <= EMPLOYEE_COUNT; i++) {
    empBatch.push({
      documentNumber: `CARGA${String(i).padStart(5, '0')}`,
      firstName: 'Empleado',
      lastName: `Carga${i}`,
      position: i % 3 === 0 ? 'Analista' : i % 3 === 1 ? 'Tecnico' : 'Auxiliar',
      area: i % 5 === 0 ? 'TI' : i % 5 === 1 ? 'RRHH' : i % 5 === 2 ? 'Finanzas' : i % 5 === 3 ? 'Operaciones' : 'Legal',
      workConfigId: wc.id,
      scheduleId: sched.id,
      weeklyTargetMinutes: 2520,
    });
  }

  for (let i = 0; i < empBatch.length; i += RAW_SQL_BATCH) {
    await prisma.employee.createMany({ data: empBatch.slice(i, i + RAW_SQL_BATCH) });
  }

  const empTime = performance.now() - t;
  const empCount = await prisma.employee.count();
  console.log(`  ${fmt(empCount)} employees created in ${fmtMs(empTime)}`);
  console.log(`  Rate: ${fmt(Math.round(empCount / (empTime / 1000)))} employees/sec`);

  const employeeIds = (await prisma.employee.findMany({ select: { id: true } })).map(e => e.id);

  // ─── PHASE 3: Create work sessions via raw SQL ────────────────
  const totalSessions = employeeIds.length * SESSIONS_PER_EMPLOYEE;
  console.log(`\n--- Phase 3: Create ${fmt(totalSessions)} work sessions (${fmt(SESSIONS_PER_EMPLOYEE)}/employee) ---`);
  t = performance.now();

  let sessionCount = 0;
  let rawRows = [];
  const now = toSQLiteDate(new Date());

  for (const empId of employeeIds) {
    for (let j = 0; j < SESSIONS_PER_EMPLOYEE; j++) {
      const month = 1 + (j % 12);
      const start = randomDate(2026, month);
      const end = addHours(start, 7 + Math.floor(Math.random() * 4));
      const totalMin = Math.round((end.getTime() - start.getTime()) / 60000);

      rawRows.push([
        empId,
        toSQLiteDate(start),
        toSQLiteDate(end),
        totalMin,
        totalMin - 60,
        0, 60, 0, 0, 0, 0, 0, 0,
        0, 0, 'NO_APLICA', now, now,
      ]);
      sessionCount++;

      if (rawRows.length >= RAW_SQL_BATCH) {
        await rawInsertSessions(rawRows);
        rawRows = [];
      }
    }
  }

  if (rawRows.length > 0) {
    await rawInsertSessions(rawRows);
  }

  const sessTime = performance.now() - t;
  console.log(`  ${fmt(sessionCount)} sessions created in ${fmtMs(sessTime)}`);
  console.log(`  Rate: ${fmt(Math.round(sessionCount / (sessTime / 1000)))} sessions/sec`);

  const mem1 = mem();
  console.log(`  RSS: ${fmtMB(mem1.rss)} | Heap: ${fmtMB(mem1.heapUsed)}`);

  // ─── PHASE 4: Query performance ──────────────────────────────
  console.log(`\n--- Phase 4: Query performance ---`);

  t = performance.now();
  const [pageData, pageCount] = await Promise.all([
    prisma.workSession.findMany({
      take: 20, skip: 0,
      orderBy: { startTime: 'desc' },
      include: { employee: { select: { id: true, firstName: true, lastName: true, documentNumber: true } } },
    }),
    prisma.workSession.count(),
  ]);
  console.log(`  Paginated list (20/${fmt(pageCount)}): ${fmtMs(performance.now() - t)}`);

  t = performance.now();
  const empSessions = await prisma.workSession.findMany({
    where: { employeeId: employeeIds[0], startTime: { gte: new Date('2026-01-01'), lt: new Date('2026-12-31') } },
    orderBy: { startTime: 'asc' },
  });
  console.log(`  Employee #1 sessions (${empSessions.length} results): ${fmtMs(performance.now() - t)}`);

  t = performance.now();
  await prisma.workSession.aggregate({
    _sum: { totalMinutes: true },
    where: { employeeId: employeeIds[0], isVoided: false, startTime: { gte: new Date('2026-03-02'), lt: new Date('2026-03-09') } },
  });
  console.log(`  Weekly aggregate: ${fmtMs(performance.now() - t)}`);

  t = performance.now();
  const reportGroupBy = await prisma.workSession.groupBy({
    by: ['employeeId'],
    _sum: {
      totalMinutes: true, ordinaryMinutes: true, nightSurchargeMinutes: true,
      extraDayMinutes: true, extraNightMinutes: true, sundayMinutes: true,
      holidayMinutes: true, extraHolidayDayMinutes: true, extraHolidayNightMinutes: true,
      sundayNightSurchargeMinutes: true,
    },
    _count: { id: true },
    where: { isVoided: false, startTime: { gte: new Date('2026-03-01'), lt: new Date('2026-04-01') } },
  });
  console.log(`  Monthly report groupBy (${reportGroupBy.length} groups): ${fmtMs(performance.now() - t)}`);

  t = performance.now();
  const searchResults = await prisma.employee.findMany({
    where: {
      OR: [
        { firstName: { contains: 'Carga' } },
        { lastName: { contains: '500' } },
        { documentNumber: { contains: '00500' } },
      ],
    },
    take: 10,
  });
  console.log(`  Employee search ("Carga500"): ${fmtMs(performance.now() - t)} (${searchResults.length} results)`);

  // ─── PHASE 5: Report generation simulation ─────────────────────
  console.log(`\n--- Phase 5: Report generation (annual) ---`);
  t = performance.now();

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, firstName: true, lastName: true, documentNumber: true, area: true },
  });

  const reportData = await prisma.workSession.groupBy({
    by: ['employeeId'],
    _sum: {
      totalMinutes: true, ordinaryMinutes: true, nightSurchargeMinutes: true,
      extraDayMinutes: true, extraNightMinutes: true, sundayMinutes: true,
      holidayMinutes: true, extraHolidayDayMinutes: true, extraHolidayNightMinutes: true,
      sundayNightSurchargeMinutes: true,
    },
    _count: { id: true },
    where: { isVoided: false, startTime: { gte: new Date('2026-01-01'), lt: new Date('2026-12-31') } },
  });

  const empMap = {};
  for (const e of employees) empMap[e.id] = e;

  const rows = reportData
    .filter(g => empMap[g.employeeId])
    .map(g => ({
      empleado: empMap[g.employeeId],
      totalSessions: g._count.id,
      ...Object.fromEntries(Object.entries(g._sum).map(([k, v]) => [k, v ?? 0])),
    }));

  const reportTime = performance.now() - t;
  console.log(`  Full annual report: ${fmtMs(reportTime)}`);
  console.log(`  Rows: ${fmt(rows.length)}`);
  console.log(`  Total hours: ${fmt(Math.round(rows.reduce((s, r) => s + (r.totalMinutes || 0), 0) / 60))}`);

  // ─── PHASE 6: SQLite database stats ───────────────────────────
  console.log(`\n--- Phase 6: Database stats ---`);
  const dbSize = await prisma.$queryRaw`SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`;
  console.log(`  Database size: ${fmtMB(Number(dbSize[0].size))}`);

  const tableCounts = {};
  for (const table of ['usuarios', 'empleados', 'horarios', 'horarios_diarios', 'configuracion_trabajo', 'distribucion_ordinaria', 'jornadas', 'festivos', 'auditoria', 'tokens_revocados']) {
    const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as c FROM "${table}"`);
    tableCounts[table] = Number(r[0].c);
  }
  console.log('  Table row counts:');
  for (const [tName, c] of Object.entries(tableCounts)) {
    console.log(`    ${tName}: ${fmt(c)}`);
  }

  // ─── PHASE 7: Cleanup test data ───────────────────────────────
  console.log(`\n--- Phase 7: Cleanup ---`);
  t = performance.now();
  await prisma.$executeRawUnsafe(`DELETE FROM jornadas WHERE empleado_id IN (SELECT id FROM empleados WHERE numero_documento LIKE 'CARGA%')`);
  await prisma.$executeRawUnsafe(`DELETE FROM empleados WHERE numero_documento LIKE 'CARGA%'`);
  await prisma.scheduleDay.deleteMany({ where: { scheduleId: sched.id } });
  await prisma.schedule.delete({ where: { id: sched.id } });
  await prisma.workConfig.delete({ where: { id: wc.id } });
  console.log(`  Cleanup: ${fmtMs(performance.now() - t)}`);

  const mem2 = mem();
  console.log(`  RSS after cleanup: ${fmtMB(mem2.rss)} | Heap: ${fmtMB(mem2.heapUsed)}`);

  // ─── SUMMARY ───────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  console.log(`Employees created:     ${fmt(empCount)}`);
  console.log(`Sessions created:      ${fmt(sessionCount)}`);
  console.log(`Employee creation:     ${fmtMs(empTime)} (${fmt(Math.round(empCount / (empTime / 1000)))}/s)`);
  console.log(`Session creation:      ${fmtMs(sessTime)} (${fmt(Math.round(sessionCount / (sessTime / 1000)))}/s)`);
  console.log(`Monthly report groupBy: ${fmtMs(reportTime)}`);
  console.log(`Peak RSS:              ${fmtMB(Math.max(mem0.rss, mem1.rss, mem2.rss))}`);
  console.log(`Peak Heap:             ${fmtMB(Math.max(mem0.heapUsed, mem1.heapUsed, mem2.heapUsed))}`);
  console.log(`DB size:               ${fmtMB(Number(dbSize[0].size))}`);

  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
