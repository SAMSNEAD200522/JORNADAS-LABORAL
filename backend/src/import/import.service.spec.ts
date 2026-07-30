import { Test, TestingModule } from '@nestjs/testing';
import { ImportService, parseColombianName } from './import.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LaborEngineService } from '../labor-engine/labor-engine.service';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { ImportModule, ImportStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'imports');

function writeTestXlsx(name: string, data: (string | number)[][]): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const filePath = path.join(UPLOADS_DIR, `${Date.now()}_${name}.xlsx`);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Test');
  XLSX.writeFile(wb, filePath);
  return filePath;
}

function cleanupFile(filePath: string) {
  try { fs.unlinkSync(filePath); } catch {}
}

describe('ImportService', () => {
  let service: ImportService;

  const mockPrisma = {
    employee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    schedule: {
      findMany: jest.fn(),
    },
    workConfig: {
      findMany: jest.fn(),
    },
    importHistory: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    importError: {
      createMany: jest.fn(),
    },
    holiday: {
      findMany: jest.fn(),
    },
    workSession: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
  };

  const mockAudit = { log: jest.fn() };
  const mockEngine = { classify: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: LaborEngineService, useValue: mockEngine },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
    jest.spyOn(service as any, 'createBackup').mockResolvedValue('/mock/backup/path.db');
    jest.spyOn(service as any, 'generateErrorReportFile').mockReturnValue('/mock/error-report.xlsx');
  });

  function setupExecuteMocks() {
    mockPrisma.importHistory.create.mockResolvedValue({ id: 1 });
    mockPrisma.importHistory.update.mockResolvedValue({});
  }

  describe('handleFileUpload', () => {
    it('accepts valid Excel uploads', () => {
      const buffer = Buffer.from('xlsx');

      const result = service.handleFileUpload({
        buffer,
        originalname: 'jornadas.xlsx',
        size: buffer.length,
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(result.filename).toBe('jornadas.xlsx');
      expect(result.mimetype).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(fs.existsSync(result.filePath)).toBe(true);

      cleanupFile(result.filePath);
    });

    it('rejects uploads with invalid extension', () => {
      expect(() =>
        service.handleFileUpload({
          buffer: Buffer.from('not excel'),
          originalname: 'jornadas.txt',
          size: 9,
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects uploads with invalid MIME type', () => {
      expect(() =>
        service.handleFileUpload({
          buffer: Buffer.from('not excel'),
          originalname: 'jornadas.xlsx',
          size: 9,
          mimetype: 'text/plain',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('parseColombianName', () => {
    it('1 word: firstName only', () => {
      expect(parseColombianName('MARIA')).toEqual({ firstName: 'MARIA', lastName: '' });
    });

    it('2 words: firstName + paternal surname', () => {
      expect(parseColombianName('MARIA GARCIA')).toEqual({
        firstName: 'MARIA',
        lastName: 'GARCIA',
      });
    });

    it('3 words: firstName + paternal + maternal surname', () => {
      expect(parseColombianName('MARIA GARCIA LOPEZ')).toEqual({
        firstName: 'MARIA',
        lastName: 'GARCIA LOPEZ',
      });
    });

    it('4 words: 2 given names + 2 surnames', () => {
      const result = parseColombianName('CARLOS ANDRES RAMIREZ PEREZ');
      expect(result.firstName).toBe('CARLOS ANDRES');
      expect(result.lastName).toBe('RAMIREZ PEREZ');
    });

    it('4 words: MARIN FRANCO ARLEX ALBERTO (not single-word first name)', () => {
      const result = parseColombianName('MARIN FRANCO ARLEX ALBERTO');
      expect(result.firstName).toBe('MARIN FRANCO');
      expect(result.lastName).toBe('ARLEX ALBERTO');
    });

    it('5 words: balanced split', () => {
      const result = parseColombianName('ANDRES FELIPE RAMIREZ LOPEZ MARIA');
      expect(result.firstName).toBe('ANDRES FELIPE RAMIREZ');
      expect(result.lastName).toBe('LOPEZ MARIA');
    });

    it('handles extra whitespace', () => {
      expect(parseColombianName('  MARIA   GARCIA  ')).toEqual({
        firstName: 'MARIA',
        lastName: 'GARCIA',
      });
    });

    it('empty string', () => {
      expect(parseColombianName('')).toEqual({ firstName: '', lastName: '' });
    });

    it('keeps fullName intact for the database', () => {
      const fullName = 'ANDRES FELIPE RAMIREZ LOPEZ';
      const result = parseColombianName(fullName);
      expect(fullName).toBe(fullName);
      expect(result.firstName).toBeTruthy();
      expect(result.lastName).toBeTruthy();
    });
  });

  describe('generateEmployeeTemplate', () => {
    it('generates XLSX with exactly 4 columns', () => {
      const buffer = service.generateEmployeeTemplate();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

      expect(data[0]).toEqual(['Postulado_nombre', 'Cargo', 'Documento', 'Contacto']);
      expect(data.length).toBe(3);
      expect(data[1].length).toBe(4);
      expect(data[2].length).toBe(4);
    });

    it('first example row has phone contact', () => {
      const buffer = service.generateEmployeeTemplate();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

      expect(data[0]['Contacto']).toBe('3001234567');
      expect(data[0]['Postulado_nombre']).toContain('Carlos');
    });

    it('second example row has email contact', () => {
      const buffer = service.generateEmployeeTemplate();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

      expect(data[1]['Contacto']).toContain('@');
    });

    it('no internal fields like DOCUMENT_TYPE, FIRST_NAME, etc.', () => {
      const buffer = service.generateEmployeeTemplate();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const headers = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] as string[];

      const forbidden = [
        'DOCUMENT_TYPE', 'DOCUMENT_NUMBER', 'FIRST_NAME', 'LAST_NAME',
        'FULL_NAME', 'POSITION', 'DEPARTMENT', 'COMPANY', 'COST_CENTER',
        'EMAIL', 'PHONE', 'EMPLOYMENT_STATUS', 'HIRE_DATE',
        'HOURLY_RATE', 'CONTRACT_TYPE', 'WORK_SCHEDULE',
      ];
      for (const f of forbidden) {
        expect(headers).not.toContain(f);
      }
    });
  });

  describe('validateEmployeeRow (via previewImport)', () => {
    it('validates all 4 required fields', async () => {
      const filePath = writeTestXlsx('val_empty', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['', '', '', ''],
      ]);

      const result = service.previewImport({ filePath, module: 'EMPLOYEES' as any });

      expect(result.summary.totalRows).toBe(1);
      expect(result.summary.invalidRows).toBe(1);
      expect(result.rows[0].errors.length).toBe(4);
      expect(result.rows[0].errors.map((e: any) => e.column)).toEqual(
        expect.arrayContaining(['Postulado_nombre', 'Cargo', 'Documento', 'Contacto']),
      );

      cleanupFile(filePath);
    });

    it('passes valid row', async () => {
      const filePath = writeTestXlsx('val_valid', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Maria Garcia Lopez', 'Analista', '1234567890', '3001234567'],
      ]);

      const result = service.previewImport({ filePath, module: 'EMPLOYEES' as any });

      expect(result.summary.validRows).toBe(1);
      expect(result.summary.invalidRows).toBe(0);
      expect(result.rows[0].errors.length).toBe(0);

      cleanupFile(filePath);
    });

    it('detects duplicate document numbers', async () => {
      const filePath = writeTestXlsx('val_dup', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Maria Garcia', 'Analista', '12345', '3001234567'],
        ['Carlos Perez', 'Dev', '12345', '3109876543'],
      ]);

      const result = service.previewImport({ filePath, module: 'EMPLOYEES' as any });

      expect(result.summary.invalidRows).toBe(1);
      const docErrors = result.rows[1].errors.filter((e: any) => e.column === 'Documento');
      expect(docErrors.length).toBe(1);
      expect(docErrors[0].errorCode).toBe('DUPLICADO_ARCHIVO');

      cleanupFile(filePath);
    });

    it('validates document number max length 30', async () => {
      const longDoc = 'A'.repeat(31);
      const filePath = writeTestXlsx('val_long', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Maria Garcia', 'Analista', longDoc, '3001234567'],
      ]);

      const result = service.previewImport({ filePath, module: 'EMPLOYEES' as any });

      expect(result.rows[0].errors.length).toBe(1);
      expect(result.rows[0].errors[0].errorCode).toBe('LONGITUD_INVALIDA');

      cleanupFile(filePath);
    });
  });

  describe('backward compatibility', () => {
    it('handles BD Personas EP format (Postulado_nombre_depurado)', async () => {
      const filePath = writeTestXlsx('compat_bd', [
        ['Postulado_nombre_depurado', 'Cargo', 'Documento', 'Contacto'],
        ['Maria Garcia Lopez', 'Analista', '1234567890', '3001234567'],
      ]);

      const result = service.previewImport({ filePath, module: 'EMPLOYEES' as any });

      expect(result.summary.validRows).toBe(1);
      expect(result.rows[0].data['Postulado_nombre']).toBe('Maria Garcia Lopez');
      expect(result.rows[0].data['Cargo']).toBe('Analista');
      expect(result.rows[0].data['Documento']).toBe('1234567890');
      expect(result.rows[0].data['Contacto']).toBe('3001234567');

      cleanupFile(filePath);
    });

    it('handles standard 4-column format', async () => {
      const filePath = writeTestXlsx('compat_std', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Carlos Andres Ramirez', 'Dev', '9876543210', 'carlos@test.com'],
      ]);

      const result = service.previewImport({ filePath, module: 'EMPLOYEES' as any });

      expect(result.summary.validRows).toBe(1);
      expect(result.rows[0].data['Postulado_nombre']).toBe('Carlos Andres Ramirez');

      cleanupFile(filePath);
    });
  });

  describe('executeEmployeeImport (defaults)', () => {
    it('resolves default schedule and work config by name', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: 1, name: 'Administrativo' },
        { id: 2, name: 'Turno Nocturno' },
      ]);
      mockPrisma.workConfig.findMany.mockResolvedValue([
        { id: 10, name: 'Administrativo (Admin)' },
        { id: 20, name: 'Operativo' },
      ]);
      mockPrisma.employee.findFirst.mockResolvedValue({ company: 'Mi Empresa' });
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_defaults', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Maria Garcia', 'Analista', '11111111', '3001111111'],
      ]);

      await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      const createCall = mockPrisma.employee.create.mock.calls[0][0].data;
      expect(createCall.scheduleId).toBe(1);
      expect(createCall.workConfigId).toBe(10);
      expect(createCall.company).toBe('Mi Empresa');
      expect(createCall.documentType).toBe('CC');
      expect(createCall.employmentStatus).toBe('ACTIVO');
      expect(createCall.contractType).toBe('INDEFINIDO');

      cleanupFile(filePath);
    });

    it('falls back to first available schedule when Administrativo not found', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: 5, name: 'General' },
      ]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_fallback', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Test User', 'Tester', '22222222', 'test@test.com'],
      ]);

      await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      const createCall = mockPrisma.employee.create.mock.calls[0][0].data;
      expect(createCall.scheduleId).toBe(5);
      expect(createCall.workConfigId).toBeNull();
      expect(createCall.company).toBe('');

      cleanupFile(filePath);
    });

    it('parses email contact correctly', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_email', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Test User', 'Dev', '33333333', 'user@company.com'],
      ]);

      await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      const createCall = mockPrisma.employee.create.mock.calls[0][0].data;
      expect(createCall.email).toBe('user@company.com');
      expect(createCall.phone).toBeNull();

      cleanupFile(filePath);
    });

    it('parses phone contact correctly', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_phone', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Test User', 'Dev', '44444444', '3101234567'],
      ]);

      await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      const createCall = mockPrisma.employee.create.mock.calls[0][0].data;
      expect(createCall.email).toBeNull();
      expect(createCall.phone).toBe('3101234567');

      cleanupFile(filePath);
    });

    it('parses Colombian names correctly (4 words)', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_name4', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Marin Franco Arlex Alberto', 'Gerente', '55555555', '5551111'],
      ]);

      await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      const createCall = mockPrisma.employee.create.mock.calls[0][0].data;
      expect(createCall.firstName).toBe('Marin Franco');
      expect(createCall.lastName).toBe('Arlex Alberto');
      expect(createCall.fullName).toBe('Marin Franco Arlex Alberto');

      cleanupFile(filePath);
    });

    it('parses Colombian names correctly (2 words)', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_name2', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Maria Garcia', 'Asistente', '66666666', '6662222'],
      ]);

      await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      const createCall = mockPrisma.employee.create.mock.calls[0][0].data;
      expect(createCall.firstName).toBe('Maria');
      expect(createCall.lastName).toBe('Garcia');

      cleanupFile(filePath);
    });

    it('parses Colombian names correctly (3 words)', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_name3', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Carlos Ramirez Perez', 'Contador', '77777777', '7773333'],
      ]);

      await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      const createCall = mockPrisma.employee.create.mock.calls[0][0].data;
      expect(createCall.firstName).toBe('Carlos');
      expect(createCall.lastName).toBe('Ramirez Perez');

      cleanupFile(filePath);
    });

    it('updates existing employee by document number', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: 42, documentNumber: '12345678' },
      ]);
      mockPrisma.employee.update.mockResolvedValue({ id: 42 });

      const filePath = writeTestXlsx('exec_update', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['Updated Name', 'New Role', '12345678', '9999999'],
      ]);

      const result = await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      expect(result.summary.insertedRows).toBe(0);
      expect(result.summary.updatedRows).toBe(1);
      expect(mockPrisma.employee.update).toHaveBeenCalled();
      expect(mockPrisma.employee.create).not.toHaveBeenCalled();

      cleanupFile(filePath);
    });

    it('creates new employee when not found', async () => {
      setupExecuteMocks();
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.workConfig.findMany.mockResolvedValue([]);
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findMany.mockResolvedValue([]);
      mockPrisma.employee.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_create', [
        ['Postulado_nombre', 'Cargo', 'Documento', 'Contacto'],
        ['New Person', 'New Role', '99999999', '3105555555'],
      ]);

      const result = await service.executeImport({
        filePath,
        module: 'EMPLOYEES' as any,
        autoCreateReferences: false,
        updateExisting: true,
      });

      expect(result.summary.insertedRows).toBe(1);
      expect(result.summary.updatedRows).toBe(0);
      expect(mockPrisma.employee.create).toHaveBeenCalled();

      cleanupFile(filePath);
    });
  });

  describe('template/export structure', () => {
    it('template has exactly the same 4 columns as export', () => {
      const templateBuffer = service.generateEmployeeTemplate();
      const templateWb = XLSX.read(templateBuffer, { type: 'buffer' });
      const templateSheet = templateWb.Sheets[templateWb.SheetNames[0]];
      const templateHeaders = XLSX.utils.sheet_to_json<string[]>(templateSheet, { header: 1 })[0] as string[];

      expect(templateHeaders).toEqual(['Postulado_nombre', 'Cargo', 'Documento', 'Contacto']);
    });

    it('export generates same column structure as template', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const exportBuffer = await service.exportEmployees();
      const exportWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const exportSheet = exportWb.Sheets[exportWb.SheetNames[0]];
      const exportHeaders = XLSX.utils.sheet_to_json<string[]>(exportSheet, { header: 1 })[0] as string[];

      expect(exportHeaders).toEqual(['Postulado_nombre', 'Cargo', 'Documento', 'Contacto']);
    });

    it('export maps email to Contacto, falls back to phone', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          fullName: 'User Email',
          firstName: 'User',
          lastName: 'Email',
          position: 'Dev',
          documentNumber: '111',
          email: 'user@test.com',
          phone: '123',
        },
        {
          fullName: 'User Phone',
          firstName: 'User',
          lastName: 'Phone',
          position: 'QA',
          documentNumber: '222',
          email: null,
          phone: '321',
        },
        {
          fullName: 'User Neither',
          firstName: 'User',
          lastName: 'Neither',
          position: 'PM',
          documentNumber: '333',
          email: null,
          phone: null,
        },
      ]);

      const exportBuffer = await service.exportEmployees();
      const exportWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const exportSheet = exportWb.Sheets[exportWb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(exportSheet);

      expect(rows[0]['Contacto']).toBe('user@test.com');
      expect(rows[1]['Contacto']).toBe('321');
      expect(rows[2]['Contacto']).toBe('');
    });
  });

  describe('rollbackImport', () => {
    it('recreates or updates ImportHistory as ROLLED_BACK after restoring backup', async () => {
      const backupPath = path.join(UPLOADS_DIR, `rollback-${Date.now()}.db`);
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }
      fs.writeFileSync(backupPath, 'backup');

      const createdAt = new Date('2026-07-08T10:00:00.000Z');
      mockPrisma.importHistory.findUnique.mockResolvedValue({
        id: 7,
        module: ImportModule.WORKDAYS,
        filename: 'jornadas.xlsx',
        fileSize: 1234,
        filePath: null,
        status: ImportStatus.COMPLETED,
        totalRows: 2,
        insertedRows: 2,
        updatedRows: 0,
        errorRows: 0,
        warningRows: 0,
        durationMs: 50,
        backupPath,
        errorReportPath: null,
        userId: 3,
        autoCreateRefs: false,
        updateExisting: true,
        dryRun: false,
        createdAt,
      });

      const order: string[] = [];
      jest.spyOn(service as any, 'restoreBackup').mockImplementation(async () => {
        order.push('restore');
      });
      mockPrisma.importHistory.upsert.mockImplementation(async () => {
        order.push('upsert');
        return {};
      });

      await service.rollbackImport(7, 3);

      expect(order).toEqual(['restore', 'upsert']);
      expect(mockPrisma.importHistory.upsert).toHaveBeenCalledWith({
        where: { id: 7 },
        update: { status: ImportStatus.ROLLED_BACK },
        create: {
          id: 7,
          module: ImportModule.WORKDAYS,
          filename: 'jornadas.xlsx',
          fileSize: 1234,
          filePath: null,
          status: ImportStatus.ROLLED_BACK,
          totalRows: 2,
          insertedRows: 2,
          updatedRows: 0,
          errorRows: 0,
          warningRows: 0,
          durationMs: 50,
          backupPath,
          errorReportPath: null,
          userId: 3,
          autoCreateRefs: false,
          updateExisting: true,
          dryRun: false,
          createdAt,
        },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 3,
          action: 'REVERTIR_IMPORTACION',
          entity: 'Importacion',
          entityId: 7,
        }),
      );

      cleanupFile(backupPath);
    });
  });

  describe('executeWorkSessionImport', () => {
    it('persists the same classified buckets used by manual work session creation', async () => {
      setupExecuteMocks();
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 9,
          documentNumber: '1234567890',
          workModality: 'ADMINISTRATIVO',
          weeklyTargetMinutes: 2400,
          workConfig: {
            breakMinutes: 30,
            breakThresholdMinutes: 360,
            weeklyTargetMinutes: 2520,
            ordinaryDistributions: [
              { dayOfWeek: 3, ordinaryMinutesCap: 480 },
            ],
          },
        },
      ]);
      mockPrisma.holiday.findMany.mockResolvedValue([
        { date: new Date('2026-07-20T00:00:00.000Z') },
      ]);
      mockEngine.classify.mockReturnValue({
        totalMinutes: 600,
        ordinarioDiurno: 100,
        ordinarioNocturno: 50,
        extraDiurno: 10,
        extraNocturno: 20,
        dominicalDiurno: 30,
        dominicalNocturno: 40,
        festivoDiurno: 50,
        festivoNocturno: 60,
        extraDominicalFestivoDiurno: 70,
        extraDominicalFestivoNocturno: 80,
      });
      mockPrisma.workSession.create.mockResolvedValue({ id: 1 });

      const filePath = writeTestXlsx('exec_work_session', [
        [
          'FECHA',
          'CEDULA EMPLEADO',
          'APELLIDOS Y NOMBRES COMPLETOS',
          'CARGO',
          'SALIDA TEORICA',
          '002-HED',
          '003-HEN',
          '004-HEFD',
          '005-HEFN',
          '006-RECNOC',
          '012-REC NOC D',
          '013-DOMINGO',
          '014-LUNES FESTIVO',
        ],
        [
          '2026-07-08',
          '1234567890',
          'Test Employee',
          'Analista',
          '17:00',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ],
      ]);

      await service.executeImport({
        filePath,
        module: ImportModule.WORK_SESSIONS,
        autoCreateReferences: false,
        updateExisting: true,
      });

      expect(mockEngine.classify).toHaveBeenCalledWith(
        expect.objectContaining({
          workModality: 'ADMINISTRATIVO',
          weeklyTargetMinutes: 2400,
          breakMinutes: 30,
          breakThresholdMinutes: 360,
        }),
      );
      expect(mockPrisma.workSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: 9,
          totalMinutes: 600,
          ordinaryMinutes: 150,
          nightSurchargeMinutes: 50,
          extraDayMinutes: 10,
          extraNightMinutes: 20,
          sundayMinutes: 70,
          holidayMinutes: 110,
          extraHolidayDayMinutes: 70,
          extraHolidayNightMinutes: 80,
          sundayNightSurchargeMinutes: 100,
        }),
      });

      cleanupFile(filePath);
    });
  });

  describe('import date validation', () => {
    it('rejects non-existent calendar dates in work session imports', () => {
      const filePath = writeTestXlsx('invalid_work_session_date', [
        [
          'FECHA',
          'CEDULA EMPLEADO',
          'APELLIDOS Y NOMBRES COMPLETOS',
          'CARGO',
          'SALIDA TEORICA',
        ],
        ['2026-02-31', '1234567890', 'Test Employee', 'Analista', '17:00'],
      ]);

      const result = service.previewImport({
        filePath,
        module: ImportModule.WORK_SESSIONS,
      });

      expect(result.summary.invalidRows).toBe(1);
      expect(result.rows[0].errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            column: 'FECHA',
            errorCode: 'FECHA_INVALIDA',
          }),
        ]),
      );

      cleanupFile(filePath);
    });

    it('rejects ambiguous date formats in raw workday imports', () => {
      const filePath = writeTestXlsx('ambiguous_workday_date', [
        ['CEDULA EMPLEADO', 'FECHA INICIO', 'HORA INICIO', 'FECHA FIN', 'HORA FIN'],
        ['1234567890', '08/07/2026', '08:00', '2026-07-08', '17:00'],
      ]);

      const result = service.previewImport({
        filePath,
        module: ImportModule.WORKDAYS,
      });

      expect(result.summary.invalidRows).toBe(1);
      expect(result.rows[0].errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            column: 'FECHA INICIO',
            errorCode: 'FECHA_INVALIDA',
          }),
        ]),
      );

      cleanupFile(filePath);
    });
  });
});
