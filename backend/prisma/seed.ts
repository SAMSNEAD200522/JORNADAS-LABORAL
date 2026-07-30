import { PrismaClient, Role, EmployeeDocumentType, WorkModality } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const holidays2026 = [
  { date: new Date(2026, 0, 1, 0, 0, 0, 0), name: 'Año Nuevo' },
  { date: new Date(2026, 0, 11, 0, 0, 0, 0), name: 'Día de los Reyes Magos' },
  { date: new Date(2026, 2, 22, 0, 0, 0, 0), name: 'Día de San José' },
  { date: new Date(2026, 3, 1, 0, 0, 0, 0), name: 'Jueves Santo' },
  { date: new Date(2026, 3, 2, 0, 0, 0, 0), name: 'Viernes Santo' },
  { date: new Date(2026, 4, 1, 0, 0, 0, 0), name: 'Día del Trabajo' },
  { date: new Date(2026, 4, 17, 0, 0, 0, 0), name: 'Ascensión del Señor' },
  { date: new Date(2026, 5, 7, 0, 0, 0, 0), name: 'Corpus Christi' },
  { date: new Date(2026, 5, 14, 0, 0, 0, 0), name: 'Sagrado Corazón de Jesús' },
  { date: new Date(2026, 5, 28, 0, 0, 0, 0), name: 'San Pedro y San Pablo' },
  { date: new Date(2026, 6, 19, 0, 0, 0, 0), name: 'Día de la Independencia' },
  { date: new Date(2026, 7, 7, 0, 0, 0, 0), name: 'Batalla de Boyacá' },
  { date: new Date(2026, 7, 16, 0, 0, 0, 0), name: 'Asunción de la Virgen' },
  { date: new Date(2026, 9, 11, 0, 0, 0, 0), name: 'Día de la Raza' },
  { date: new Date(2026, 10, 1, 0, 0, 0, 0), name: 'Todos los Santos' },
  { date: new Date(2026, 10, 15, 0, 0, 0, 0), name: 'Independencia de Cartagena' },
  { date: new Date(2026, 11, 7, 0, 0, 0, 0), name: 'Inmaculada Concepción' },
  { date: new Date(2026, 11, 25, 0, 0, 0, 0), name: 'Navidad' },
];

async function main() {
  await prisma.workSession.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.importError.deleteMany();
  await prisma.importHistory.deleteMany();
  await prisma.ordinaryDistribution.deleteMany();
  await prisma.scheduleDay.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.workConfig.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.blacklistedToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.globalConfig.deleteMany();

  // ─── GlobalConfig ──────────────────────────────────────────
  await prisma.globalConfig.create({
    data: {
      nightStart: '19:00',
      nightEnd: '06:00',
      defaultBreakMinutes: 60,
    },
  });

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

  // ─── Schedules ─────────────────────────────────────────────
  const adminSchedule = await prisma.schedule.create({
    data: {
      name: 'Administrativo',
      startTime: '07:00',
      endTime: '16:00',
      workDays: '1,2,3,4,5',
      breakMinutes: 60,
    },
  });

  const adminScheduleDays = [
    { dayOfWeek: 1, startTime: '07:00', endTime: '16:00', breakMinutes: 60 },
    { dayOfWeek: 2, startTime: '07:00', endTime: '16:00', breakMinutes: 60 },
    { dayOfWeek: 3, startTime: '07:00', endTime: '16:00', breakMinutes: 60 },
    { dayOfWeek: 4, startTime: '07:00', endTime: '16:00', breakMinutes: 60 },
    { dayOfWeek: 5, startTime: '07:00', endTime: '16:00', breakMinutes: 60 },
  ];

  for (const d of adminScheduleDays) {
    await prisma.scheduleDay.create({
      data: { scheduleId: adminSchedule.id, ...d },
    });
  }

  const territorySchedule = await prisma.schedule.create({
    data: {
      name: 'Territorio',
      startTime: '06:00',
      endTime: '15:00',
      workDays: '1,2,3,4,5,6',
      breakMinutes: 60,
    },
  });

  const territoryScheduleDays = [
    { dayOfWeek: 1, startTime: '06:00', endTime: '15:00', breakMinutes: 60 },
    { dayOfWeek: 2, startTime: '06:00', endTime: '15:00', breakMinutes: 60 },
    { dayOfWeek: 3, startTime: '06:00', endTime: '15:00', breakMinutes: 60 },
    { dayOfWeek: 4, startTime: '06:00', endTime: '15:00', breakMinutes: 60 },
    { dayOfWeek: 5, startTime: '06:00', endTime: '15:00', breakMinutes: 60 },
    { dayOfWeek: 6, startTime: '06:00', endTime: '15:00', breakMinutes: 60 },
  ];

  for (const d of territoryScheduleDays) {
    await prisma.scheduleDay.create({
      data: { scheduleId: territorySchedule.id, ...d },
    });
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
    { dayOfWeek: 1, ordinaryMinutesCap: 540 },
    { dayOfWeek: 2, ordinaryMinutesCap: 540 },
    { dayOfWeek: 3, ordinaryMinutesCap: 480 },
    { dayOfWeek: 4, ordinaryMinutesCap: 480 },
    { dayOfWeek: 5, ordinaryMinutesCap: 480 },
    { dayOfWeek: 6, ordinaryMinutesCap: 0 },
    { dayOfWeek: 0, ordinaryMinutesCap: 0 },
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
        ordinaryMinutesCap: 360,
      },
    });
  }

  // ─── Employees ─────────────────────────────────────────────
  await prisma.employee.create({
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
      scheduleId: adminSchedule.id,
      weeklyTargetMinutes: 2520,
    },
  });

  await prisma.employee.create({
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
      scheduleId: territorySchedule.id,
      weeklyTargetMinutes: 2520,
    },
  });

  await prisma.employee.create({
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
      scheduleId: adminSchedule.id,
      weeklyTargetMinutes: 2520,
    },
  });

  console.log('Seed completado: datos funcionales creados.');
  console.log(`  - ${await prisma.user.count()} usuarios`);
  console.log(`  - ${await prisma.employee.count()} empleados`);
  console.log(`  - ${await prisma.schedule.count()} horarios`);
  console.log(`  - ${await prisma.scheduleDay.count()} horarios diarios`);
  console.log(`  - ${await prisma.workConfig.count()} configuraciones laborales`);
  console.log(`  - ${await prisma.ordinaryDistribution.count()} distribuciones ordinarias`);
  console.log(`  - ${await prisma.holiday.count()} festivos`);
  console.log(`  - ${await prisma.globalConfig.count()} configuraciones globales`);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
