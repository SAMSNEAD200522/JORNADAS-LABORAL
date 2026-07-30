const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./dev.db' } } });
async function main() {
  const schedules = await prisma.schedule.findMany({ select: { id: true, name: true } });
  console.log('Schedules:', JSON.stringify(schedules));
  const workConfigs = await prisma.workConfig.findMany({ select: { id: true, name: true } });
  console.log('WorkConfigs:', JSON.stringify(workConfigs));
  const users = await prisma.user.count();
  console.log('Users:', users);
  const employees = await prisma.employee.count();
  console.log('Employees:', employees);
  const holidays = await prisma.holiday.count();
  console.log('Holidays:', holidays);
  const globalConfig = await prisma.globalConfig.findFirst();
  console.log('GlobalConfig:', globalConfig ? 'EXISTS' : 'MISSING');
  const scheduleDays = await prisma.scheduleDay.count();
  console.log('ScheduleDays:', scheduleDays);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
