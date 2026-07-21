import { PrismaClient, Role, EmployeeDocumentType, WorkModality } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const holidays2026 = [
  { date: new Date('2026-01-01T00:00:00.000Z'), name: 'Año Nuevo' },
  { date: new Date('2026-01-12T00:00:00.000Z'), name: 'Día de los Reyes Magos' },
  { date: new Date('2026-03-23T00:00:00.000Z'), name: 'Día de San José' },
  { date: new Date('2026-04-02T00:00:00.000Z'), name: 'Jueves Santo' },
  { date: new Date('2026-04-03T00:00:00.000Z'), name: 'Viernes Santo' },
  { date: new Date('2026-05-01T00:00:00.000Z'), name: 'Día del Trabajo' },
  { date: new Date('2026-05-18T00:00:00.000Z'), name: 'Ascensión del Señor' },
  { date: new Date('2026-06-08T00:00:00.000Z'), name: 'Corpus Christi' },
  { date: new Date('2026-06-15T00:00:00.000Z'), name: 'Sagrado Corazón de Jesús' },
  { date: new Date('2026-06-29T00:00:00.000Z'), name: 'San Pedro y San Pablo' },
  { date: new Date('2026-07-20T00:00:00.000Z'), name: 'Día de la Independencia' },
  { date: new Date('2026-08-07T00:00:00.000Z'), name: 'Batalla de Boyacá' },
  { date: new Date('2026-08-17T00:00:00.000Z'), name: 'Asunción de la Virgen' },
  { date: new Date('2026-10-12T00:00:00.000Z'), name: 'Día de la Raza' },
  { date: new Date('2026-11-02T00:00:00.000Z'), name: 'Todos los Santos' },
  { date: new Date('2026-11-16T00:00:00.000Z'), name: 'Independencia de Cartagena' },
  { date: new Date('2026-12-08T00:00:00.000Z'), name: 'Inmaculada Concepción' },
  { date: new Date('2026-12-25T00:00:00.000Z'), name: 'Navidad' },
];

async function main() {
  // ─── Clear all data in dependency order ─────────────────────
  await prisma.workSession.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ordinaryDistribution.deleteMany();
  await prisma.scheduleDay.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.workConfig.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.user.deleteMany();

  // ─── Users ─────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('admin123', 10);

  await prisma.user.createMany({
    data: [
      { email: 'admin@empresa.com', passwordHash, name: 'Administrador', role: Role.ADMINISTRADOR },
      { email: 'rrhh@empresa.com', passwordHash, name: 'Gestión Humana', role: Role.GESTION_HUMANA },
      { email: 'supervisor@empresa.com', passwordHash, name: 'Supervisor', role: Role.SUPERVISOR },
    ],
  });

  // ─── Holidays ──────────────────────────────────────────────
  for (const h of holidays2026) {
    await prisma.holiday.create({ data: { date: h.date, name: h.name } });
  }

  // ─── WorkConfig: ADMINISTRATIVO ─────────────────────────────
  const adminConfig = await prisma.workConfig.create({
    data: {
      name: 'Administrativo',
      description: 'Jornada ordinaria de oficina, distribución de 42h semanales',
      modality: WorkModality.ADMINISTRATIVO,
      breakMinutes: 60,
      weeklyTargetMinutes: 2520,
    },
  });

  const adminDistributions = [
    { dayOfWeek: 1, ordinaryMinutesCap: 540 },  // Lunes: 9h
    { dayOfWeek: 2, ordinaryMinutesCap: 540 },  // Martes: 9h
    { dayOfWeek: 3, ordinaryMinutesCap: 480 },  // Miércoles: 8h
    { dayOfWeek: 4, ordinaryMinutesCap: 480 },  // Jueves: 8h
    { dayOfWeek: 5, ordinaryMinutesCap: 480 },  // Viernes: 8h
    { dayOfWeek: 6, ordinaryMinutesCap: 0 },    // Sábado: sin ordinario
    { dayOfWeek: 0, ordinaryMinutesCap: 0 },    // Domingo: sin ordinario
  ];

  for (const d of adminDistributions) {
    await prisma.ordinaryDistribution.create({
      data: {
        workConfigId: adminConfig.id,
        dayOfWeek: d.dayOfWeek,
        ordinaryMinutesCap: d.ordinaryMinutesCap,
      },
    });
  }

  // ─── WorkConfig: TERRITORIO ────────────────────────────────
  const territoryConfig = await prisma.workConfig.create({
    data: {
      name: 'Territorio',
      description: 'Jornada de campo, sin horario fijo, tope diario 6h',
      modality: WorkModality.TERRITORIO,
      breakMinutes: 60,
      breakThresholdMinutes: 420,
      weeklyTargetMinutes: 2520,
    },
  });

  for (let d = 0; d <= 6; d++) {
    await prisma.ordinaryDistribution.create({
      data: {
        workConfigId: territoryConfig.id,
        dayOfWeek: d,
        ordinaryMinutesCap: 360,  // 6h por día (7 × 360 = 2520 semanal)
      },
    });
  }

  // ─── Employees ─────────────────────────────────────────────
  const carlos = await prisma.employee.create({
    data: {
      documentType: EmployeeDocumentType.CC,
      documentNumber: '1000000001',
      firstName: 'Carlos Andrés',
      lastName: 'Ramírez Pérez',
      email: 'carlos.ramirez@empresa.com',
      phone: '3001111111',
      position: 'Analista Senior',
      area: 'Tecnología',
      workModality: WorkModality.ADMINISTRATIVO,
      workConfigId: adminConfig.id,
      weeklyTargetMinutes: 2520,
    },
  });

  const maria = await prisma.employee.create({
    data: {
      documentType: EmployeeDocumentType.CC,
      documentNumber: '1000000002',
      firstName: 'María',
      lastName: 'García Torres',
      email: 'maria.garcia@empresa.com',
      phone: '3002222222',
      position: 'Asesora Comercial',
      area: 'Ventas',
      workModality: WorkModality.TERRITORIO,
      workConfigId: territoryConfig.id,
      weeklyTargetMinutes: 2520,
    },
  });

  const pedro = await prisma.employee.create({
    data: {
      documentType: EmployeeDocumentType.CC,
      documentNumber: '1000000003',
      firstName: 'Pedro',
      lastName: 'López Martínez',
      email: 'pedro.lopez@empresa.com',
      phone: '3003333333',
      position: 'Vigilante',
      area: 'Seguridad',
      workModality: WorkModality.ADMINISTRATIVO,
      workConfigId: adminConfig.id,
      weeklyTargetMinutes: 2520,
    },
  });

  console.log('Seed completado: datos funcionales creados.');
  console.log(`  - ${await prisma.user.count()} usuarios`);
  console.log(`  - ${await prisma.employee.count()} empleados`);
  console.log(`  - ${await prisma.workConfig.count()} configuraciones laborales`);
  console.log(`  - ${await prisma.ordinaryDistribution.count()} distribuciones ordinarias`);
  console.log(`  - ${await prisma.holiday.count()} festivos`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
