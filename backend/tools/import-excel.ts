import { PrismaClient, WorkModality, EmployeeDocumentType } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const EXCEL_PATH = 'C:/Users/Usuario/Downloads/39. NOVEDA DE  NOMINA 9 al 23 DE JUNIO 2026.xlsx';
const API = 'http://localhost:3000/api/v1';

function serialToDate(serial: number): string {
  const d = new Date((serial - 2) * 86400000 + Date.UTC(1900, 0, 1));
  return d.toISOString().split('T')[0];
}

function serialToFullDate(serial: number): Date {
  return new Date((serial - 2) * 86400000 + Date.UTC(1900, 0, 1));
}

function parseRange(range: string, dateStr: string): { start: Date; end: Date } {
  const [startH, startM] = range.split('-')[0].split(':').map(Number);
  const [endH, endM] = range.split('-')[1].split(':').map(Number);
  const baseDate = new Date(dateStr + 'T00:00:00-05:00');
  const start = new Date(baseDate);
  start.setHours(startH, startM, 0, 0);
  const end = new Date(baseDate);
  end.setHours(endH, endM, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

async function login(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@empresa.com', password: 'admin123' }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error('Login failed: ' + JSON.stringify(data));
  return data.accessToken;
}

async function getConfigs(token: string): Promise<any[]> {
  const res = await fetch(`${API}/configuracion-laboral`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function upsertEmployee(data: any): Promise<any> {
  const docNum = String(data.documentNumber);
  const existing = await prisma.employee.findUnique({ where: { documentNumber: docNum } });
  if (existing) {
    await prisma.employee.update({
      where: { id: existing.id },
      data: {
        workConfigId: data.workConfigId,
        workModality: data.workModality,
        weeklyTargetMinutes: data.weeklyTargetMinutes,
        position: data.position || existing.position,
        area: data.area || existing.area,
      },
    });
    return existing;
  }
  return prisma.employee.create({
    data: {
      documentType: data.documentType,
      documentNumber: docNum,
      firstName: data.firstName,
      lastName: data.lastName,
      position: data.position,
      area: data.area,
      workModality: data.workModality,
      workConfigId: data.workConfigId,
      weeklyTargetMinutes: data.weeklyTargetMinutes,
    },
  });
}

async function createSession(token: string, data: any): Promise<any> {
  const res = await fetch(`${API}/jornadas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('  Error creating session:', JSON.stringify(body).slice(0, 200));
    return null;
  }
  return body;
}

async function main() {
  console.log('=== INICIO IMPORTACION EXCEL ===\n');

  // 1. Read Excel
  const wb = XLSX.readFile(EXCEL_PATH);
  const baseSheet = XLSX.utils.sheet_to_json(wb.Sheets['BASE DE DATOS'], { header: 1, defval: '' }) as any[][];
  const fechasSheet = XLSX.utils.sheet_to_json(wb.Sheets['FECHAS'], { header: 1, defval: '' }) as any[][];
  const totalSheet = XLSX.utils.sheet_to_json(wb.Sheets['TOTAL HORAS'], { header: 1, defval: '' }) as any[][];

  console.log(`BASE DE DATOS: ${baseSheet.length - 1} empleados`);
  console.log(`FECHAS: ${fechasSheet.length - 1} registros`);
  console.log(`TOTAL HORAS: ${totalSheet.length - 1} registros\n`);

  // 2. Login
  console.log('Autenticando...');
  const token = await login();
  console.log('Token obtenido\n');

  // 3. Get or create work configs
  console.log('Verificando configuraciones laborales...');
  const territoryConfigId = 4;

  const existingConfig = await prisma.workConfig.findFirst({ where: { name: 'Territorio' } });
  if (!existingConfig) {
    console.error('ERROR: Configuración Territorio no encontrada. Ejecute seed primero.');
    process.exit(1);
  }
  const configId = existingConfig.id;
  console.log(`Usando configuración Territorio (id=${configId})\n`);

  // 4. Select 20 employees from BASE DE DATOS (skip header row 0)
  const allEmployees = baseSheet.slice(1).filter((r: any[]) => r[0] && r[1]);
  console.log(`Total empleados en BASE DE DATOS: ${allEmployees.length}`);

  // Select 20 employees with variety
  const selected = allEmployees.slice(0, 20);
  console.log(`Seleccionados ${selected.length} empleados para importar\n`);

  // 5. Import each employee and their sessions
  let totalSessions = 0;
  let totalEmployees = 0;

  for (const emp of selected) {
    const cedula = String(emp[0]).trim();
    const fullName = String(emp[1]).trim();
    const costCenter = String(emp[2] || '').trim();
    const cargo = String(emp[3] || '').trim();

    // Parse name: "APELLIDOS NOMBRES" format
    const nameParts = fullName.split(' ');
    const lastName = nameParts.slice(0, Math.ceil(nameParts.length / 2)).join(' ');
    const firstName = nameParts.slice(Math.ceil(nameParts.length / 2)).join(' ');

    console.log(`Empleado: ${cedula} - ${firstName} ${lastName}`);

    // Upsert via Prisma
    const empData = {
      documentType: 'CC' as const,
      documentNumber: cedula,
      firstName: firstName || fullName,
      lastName: lastName || '.',
      position: cargo || undefined,
      area: costCenter || undefined,
      workModality: 'TERRITORIO' as const,
      workConfigId: configId,
      weeklyTargetMinutes: 2520,
    };

    const created = await upsertEmployee(empData);
    totalEmployees++;

    const empId = created.id;

    // Get all sessions for this employee from FECHAS
    const sessions = fechasSheet
      .filter((r: any[]) => String(r[1]) === cedula && r[5])
      .map((r: any[]) => ({
        dateSerial: Number(r[0]),
        range: String(r[5]).trim(),
        hed: r[6],
        hen: r[7],
        hefd: r[8],
        hefn: r[9],
        recnoct: r[10],
        recnocdom: r[11],
        domingo: r[12],
        festivo: r[13],
      }))
      .sort((a, b) => a.dateSerial - b.dateSerial);

    console.log(`  -> ${sessions.length} jornadas encontradas`);

    if (sessions.length === 0) continue;

    // Create sessions in chronological order
    for (const ses of sessions) {
      const dateStr = serialToDate(ses.dateSerial);
      const fullDate = serialToFullDate(ses.dateSerial);
      const { start, end } = parseRange(ses.range, dateStr);

      // Check for holiday
      const dayOfWeek = fullDate.getDay();

      const sesData = {
        employeeId: empId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      };

      const createdSes = await createSession(token, sesData);
      if (createdSes) {
        totalSessions++;
        const totalH = Math.round((createdSes.totalMinutes || 0) / 60 * 10) / 10;
        console.log(`    ${dateStr} ${ses.range}: creada (${totalH}h)`);
      }
    }
  }

  console.log(`\n=== IMPORTACION COMPLETADA ===`);
  console.log(`Empleados importados: ${totalEmployees}`);
  console.log(`Jornadas importadas: ${totalSessions}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
