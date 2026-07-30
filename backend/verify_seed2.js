const { PrismaClient } = require('@prisma/client');
const path = require('path');
const dbPath = path.resolve(__dirname, 'prisma', 'dev.db');
console.log('Connecting to:', dbPath);
const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + dbPath } } });
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
  const scheduleDays = await prisma.scheduleDay.count();
  console.log('ScheduleDays:', scheduleDays);
  await prisma.();
}
main().catch(e => { console.error(e.message); process.exit(1); });
