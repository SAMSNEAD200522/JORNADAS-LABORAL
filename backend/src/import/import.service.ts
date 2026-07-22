import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PreviewImportDto } from './dto/preview-import.dto';
import { ExecuteImportDto } from './dto/execute-import.dto';
import {
  Prisma,
  ImportModule,
  ImportStatus,
  EmployeeDocumentType,
  EmploymentStatus,
  ContractType,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationError {
  column: string;
  errorCode: string;
  message: string;
  severity: string;
  rawValue?: string;
}

export interface RowValidation {
  rowNumber: number;
  data: Record<string, string>;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface PreviewResult {
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
  };
  rows: RowValidation[];
  columns: string[];
  filename: string;
}

export interface ImportResult {
  summary: {
    totalRows: number;
    insertedRows: number;
    updatedRows: number;
    errorRows: number;
    warningRows: number;
    durationMs: number;
  };
  importHistoryId: number;
}

const EMPLOYEE_TEMPLATE_HEADERS = [
  'DOCUMENT_TYPE',
  'DOCUMENT_NUMBER',
  'FIRST_NAME',
  'LAST_NAME',
  'FULL_NAME',
  'POSITION',
  'DEPARTMENT',
  'COMPANY',
  'COST_CENTER',
  'EMAIL',
  'PHONE',
  'EMPLOYMENT_STATUS',
  'HIRE_DATE',
  'HOURLY_RATE',
  'CONTRACT_TYPE',
  'WORK_SCHEDULE',
];

const WORK_SESSION_TEMPLATE_HEADERS = [
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
];

const VALID_DOCUMENT_TYPES = ['CC', 'CE', 'PASAPORTE'];
const VALID_EMPLOYMENT_STATUSES = [
  'ACTIVO',
  'INACTIVO',
  'LICENCIA',
  'SUSPENDIDO',
  'RETIRADO',
];
const VALID_CONTRACT_TYPES = [
  'INDEFINIDO',
  'TERMINO_FIJO',
  'TERMINO_INDEFINIDO',
  'OBRA_O_SERVICIO',
  'PRACTICAS',
  'APRENDIZAJE',
];

@Injectable()
export class ImportService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  handleFileUpload(file: {
    buffer: Buffer;
    originalname: string;
    size: number;
    mimetype: string;
  }) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'imports');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${timestamp}_${safeName}`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    return {
      filePath,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  private parseFile(buffer: Buffer): Record<string, string>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El archivo no contiene hojas de datos',
        code: 'ARCHIVO_VACIO',
      });
    }
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  private validateEmployeeRow(
    row: Record<string, string>,
    index: number,
    seenDocNumbers: Map<string, number>,
  ): RowValidation {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const docType = String(row['DOCUMENT_TYPE'] ?? '').trim();
    if (!docType) {
      errors.push({
        column: 'DOCUMENT_TYPE',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El tipo de documento es obligatorio',
        severity: 'error',
      });
    } else if (!VALID_DOCUMENT_TYPES.includes(docType)) {
      errors.push({
        column: 'DOCUMENT_TYPE',
        errorCode: 'VALOR_INVALIDO',
        message: `Tipo de documento inválido. Valores permitidos: ${VALID_DOCUMENT_TYPES.join(', ')}`,
        severity: 'error',
        rawValue: docType,
      });
    }

    const docNumber = String(row['DOCUMENT_NUMBER'] ?? '').trim();
    if (!docNumber) {
      errors.push({
        column: 'DOCUMENT_NUMBER',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El número de documento es obligatorio',
        severity: 'error',
      });
    } else if (docNumber.length > 30) {
      errors.push({
        column: 'DOCUMENT_NUMBER',
        errorCode: 'LONGITUD_INVALIDA',
        message: 'El número de documento no puede exceder 30 caracteres',
        severity: 'error',
        rawValue: docNumber,
      });
    } else if (seenDocNumbers.has(docNumber)) {
      errors.push({
        column: 'DOCUMENT_NUMBER',
        errorCode: 'DUPLICADO_ARCHIVO',
        message: `Número de documento duplicado en la fila ${seenDocNumbers.get(docNumber)}`,
        severity: 'error',
        rawValue: docNumber,
      });
    } else {
      seenDocNumbers.set(docNumber, index + 2);
    }

    const firstName = String(row['FIRST_NAME'] ?? '').trim();
    if (!firstName) {
      errors.push({
        column: 'FIRST_NAME',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El nombre es obligatorio',
        severity: 'error',
      });
    }

    const lastName = String(row['LAST_NAME'] ?? '').trim();
    if (!lastName) {
      errors.push({
        column: 'LAST_NAME',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El apellido es obligatorio',
        severity: 'error',
      });
    }

    const email = String(row['EMAIL'] ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({
        column: 'EMAIL',
        errorCode: 'EMAIL_INVALIDO',
        message: 'El formato del correo electrónico no es válido',
        severity: 'error',
        rawValue: email,
      });
    }

    const status = String(row['EMPLOYMENT_STATUS'] ?? '').trim();
    if (status && !VALID_EMPLOYMENT_STATUSES.includes(status)) {
      errors.push({
        column: 'EMPLOYMENT_STATUS',
        errorCode: 'VALOR_INVALIDO',
        message: `Estado laboral inválido. Valores permitidos: ${VALID_EMPLOYMENT_STATUSES.join(', ')}`,
        severity: 'error',
        rawValue: status,
      });
    }

    const contractType = String(row['CONTRACT_TYPE'] ?? '').trim();
    if (contractType && !VALID_CONTRACT_TYPES.includes(contractType)) {
      errors.push({
        column: 'CONTRACT_TYPE',
        errorCode: 'VALOR_INVALIDO',
        message: `Tipo de contrato inválido. Valores permitidos: ${VALID_CONTRACT_TYPES.join(', ')}`,
        severity: 'error',
        rawValue: contractType,
      });
    }

    const hireDate = String(row['HIRE_DATE'] ?? '').trim();
    if (hireDate && isNaN(Date.parse(hireDate))) {
      errors.push({
        column: 'HIRE_DATE',
        errorCode: 'FECHA_INVALIDA',
        message: 'El formato de fecha no es válido (use YYYY-MM-DD)',
        severity: 'error',
        rawValue: hireDate,
      });
    }

    const hourlyRate = row['HOURLY_RATE'];
    if (hourlyRate !== undefined && hourlyRate !== '' && hourlyRate !== null) {
      const rate = Number(hourlyRate);
      if (isNaN(rate) || rate < 0) {
        errors.push({
          column: 'HOURLY_RATE',
          errorCode: 'VALOR_INVALIDO',
          message: 'La tarifa horaria debe ser un número positivo',
          severity: 'error',
          rawValue: String(hourlyRate),
        });
      }
    }

    const fullName = String(row['FULL_NAME'] ?? '').trim();
    if (!fullName && firstName && lastName) {
      warnings.push({
        column: 'FULL_NAME',
        errorCode: 'CAMPO_NO_PROPORCIONADO',
        message: 'El nombre completo se generará automáticamente',
        severity: 'warning',
      });
    }

    return {
      rowNumber: index + 2,
      data: row,
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateWorkSessionRow(
    row: Record<string, string>,
    index: number,
  ): RowValidation {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const fecha = String(row['FECHA'] ?? '').trim();
    if (!fecha) {
      errors.push({
        column: 'FECHA',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'La fecha es obligatoria',
        severity: 'error',
      });
    } else if (isNaN(Date.parse(fecha))) {
      errors.push({
        column: 'FECHA',
        errorCode: 'FECHA_INVALIDA',
        message: 'El formato de fecha no es válido',
        severity: 'error',
        rawValue: fecha,
      });
    }

    const docNumber = String(row['CEDULA EMPLEADO'] ?? '').trim();
    if (!docNumber) {
      errors.push({
        column: 'CEDULA EMPLEADO',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'La cédula del empleado es obligatoria',
        severity: 'error',
      });
    }

    const hourColumns = [
      '002-HED',
      '003-HEN',
      '004-HEFD',
      '005-HEFN',
      '006-RECNOC',
      '012-REC NOC D',
      '013-DOMINGO',
      '014-LUNES FESTIVO',
    ];
    for (const col of hourColumns) {
      const val = row[col];
      if (val !== undefined && val !== '' && val !== null) {
        const num = Number(val);
        if (isNaN(num) || num < 0) {
          errors.push({
            column: col,
            errorCode: 'VALOR_INVALIDO',
            message: `El valor de ${col} debe ser un número positivo`,
            severity: 'error',
            rawValue: String(val),
          });
        }
      }
    }

    return {
      rowNumber: index + 2,
      data: row,
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  previewImport(dto: PreviewImportDto): PreviewResult {
    const buffer = this.readFileFromPath(dto.filePath);
    const filename = path.basename(dto.filePath);

    const rows = this.parseFile(buffer);
    if (rows.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El archivo está vacío o no contiene datos válidos',
        code: 'ARCHIVO_VACIO',
      });
    }

    const columns = Object.keys(rows[0]);
    const validations: RowValidation[] = [];
    const seenDocNumbers = new Map<string, number>();

    for (let i = 0; i < rows.length; i++) {
      if (dto.module === ImportModule.EMPLOYEES) {
        validations.push(this.validateEmployeeRow(rows[i], i, seenDocNumbers));
      } else if (dto.module === ImportModule.WORK_SESSIONS) {
        validations.push(this.validateWorkSessionRow(rows[i], i));
      } else {
        throw new BadRequestException({
          statusCode: 400,
          message: `Módulo ${dto.module} no soportado para previsualización`,
          code: 'MODULO_NO_SOPORTADO',
        });
      }
    }

    const validRows = validations.filter((v) => v.isValid).length;
    const invalidRows = validations.filter((v) => !v.isValid).length;
    const warningRows = validations.filter(
      (v) => v.isValid && v.warnings.length > 0,
    ).length;

    return {
      summary: { totalRows: rows.length, validRows, invalidRows, warningRows },
      rows: validations,
      columns,
      filename,
    };
  }

  async executeImport(
    dto: ExecuteImportDto,
    userId?: number,
  ): Promise<ImportResult> {
    const buffer = this.readFileFromPath(dto.filePath);
    const filename = path.basename(dto.filePath);
    const fileSize = buffer.length;

    if (dto.dryRun) {
      const preview = this.previewImport({
        ...dto,
        filePath: dto.filePath,
      });
      return {
        summary: {
          totalRows: preview.summary.totalRows,
          insertedRows: 0,
          updatedRows: 0,
          errorRows: preview.summary.invalidRows,
          warningRows: preview.summary.warningRows,
          durationMs: 0,
        },
        importHistoryId: 0,
      };
    }

    const startTime = Date.now();
    const backupPath = await this.createBackup(userId);

    const rows = this.parseFile(buffer);
    if (rows.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El archivo está vacío',
        code: 'ARCHIVO_VACIO',
      });
    }

    const seenDocNumbers = new Map<string, number>();
    const validations: RowValidation[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (dto.module === ImportModule.EMPLOYEES) {
        validations.push(this.validateEmployeeRow(rows[i], i, seenDocNumbers));
      } else if (dto.module === ImportModule.WORK_SESSIONS) {
        validations.push(this.validateWorkSessionRow(rows[i], i));
      } else {
        throw new BadRequestException({
          statusCode: 400,
          message: `Módulo ${dto.module} no soportado para importación`,
          code: 'MODULO_NO_SOPORTADO',
        });
      }
    }

    const validRows = validations.filter((v) => v.isValid);
    const allErrors = validations.flatMap((v) =>
      v.errors.map((e) => ({ ...e, rowNumber: v.rowNumber })),
    );
    const allWarnings = validations.flatMap((v) =>
      v.warnings.map((w) => ({ ...w, rowNumber: v.rowNumber })),
    );

    const importHistory = await this.prisma.importHistory.create({
      data: {
        module: dto.module,
        filename,
        fileSize,
        status: ImportStatus.PROCESSING,
        totalRows: rows.length,
        errorRows: allErrors.length,
        warningRows: allWarnings.length,
        backupPath,
        userId: userId ?? null,
        autoCreateRefs: dto.autoCreateReferences ?? false,
        updateExisting: dto.updateExisting ?? true,
      },
    });

    try {
      let insertedRows = 0;
      let updatedRows = 0;

      if (dto.module === ImportModule.EMPLOYEES) {
        const result = await this.executeEmployeeImport(
          validRows,
          dto.autoCreateReferences ?? false,
          dto.updateExisting ?? true,
        );
        insertedRows = result.inserted;
        updatedRows = result.updated;
      } else if (dto.module === ImportModule.WORK_SESSIONS) {
        const result = await this.executeWorkSessionImport(
          validRows,
          dto.autoCreateReferences ?? false,
        );
        insertedRows = result.inserted;
        updatedRows = result.updated;
      }

      const durationMs = Date.now() - startTime;

      if (allErrors.length > 0) {
        await this.prisma.importError.createMany({
          data: allErrors.map((e) => ({
            importHistoryId: importHistory.id,
            rowNumber: e.rowNumber ?? 0,
            column: e.column,
            errorCode: e.errorCode,
            message: e.message,
            severity: e.severity,
            rawValue: e.rawValue ?? null,
          })),
        });
      }

      let errorReportPath: string | null = null;
      if (allErrors.length > 0) {
        errorReportPath = this.generateErrorReportFile(
          importHistory.id,
          allErrors,
        );
      }

      const finalStatus =
        allErrors.length > 0 && insertedRows + updatedRows === 0
          ? ImportStatus.FAILED
          : ImportStatus.COMPLETED;

      await this.prisma.importHistory.update({
        where: { id: importHistory.id },
        data: {
          status: finalStatus,
          insertedRows,
          updatedRows,
          durationMs,
          errorReportPath,
        },
      });

      void this.audit.log({
        userId,
        action: 'IMPORTAR',
        entity: 'Importacion',
        entityId: importHistory.id,
        newValues: {
          module: dto.module,
          filename,
          totalRows: rows.length,
          insertedRows,
          updatedRows,
          errorRows: allErrors.length,
        },
      });

      return {
        summary: {
          totalRows: rows.length,
          insertedRows,
          updatedRows,
          errorRows: allErrors.length,
          warningRows: allWarnings.length,
          durationMs,
        },
        importHistoryId: importHistory.id,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.prisma.importHistory.update({
        where: { id: importHistory.id },
        data: {
          status: ImportStatus.FAILED,
          durationMs,
        },
      });

      void this.audit.log({
        userId,
        action: 'IMPORTAR_FALLIDA',
        entity: 'Importacion',
        entityId: importHistory.id,
        newValues: {
          module: dto.module,
          filename,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  private async executeEmployeeImport(
    validRows: RowValidation[],
    autoCreateRefs: boolean,
    updateExisting: boolean,
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    const schedules = await this.prisma.schedule.findMany({
      select: { id: true, name: true },
    });
    const scheduleMap = new Map(
      schedules.map((s) => [s.name.toLowerCase(), s.id]),
    );

    const docNumbers = validRows.map((r) =>
      String(r.data['DOCUMENT_NUMBER'] ?? '').trim(),
    );
    const existingEmployees = await this.prisma.employee.findMany({
      where: { documentNumber: { in: docNumbers } },
      select: { id: true, documentNumber: true },
    });
    const existingMap = new Map(
      existingEmployees.map((e) => [e.documentNumber, e.id]),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const data = row.data;
        const docNumber = String(data['DOCUMENT_NUMBER'] ?? '').trim();
        const docType = String(
          data['DOCUMENT_TYPE'] ?? '',
        ).trim() as EmployeeDocumentType;
        const firstName = String(data['FIRST_NAME'] ?? '').trim();
        const lastName = String(data['LAST_NAME'] ?? '').trim();
        const fullName =
          String(data['FULL_NAME'] ?? '').trim() || `${firstName} ${lastName}`;
        const position = String(data['POSITION'] ?? '').trim() || null;
        const department = String(data['DEPARTMENT'] ?? '').trim() || null;
        const company = String(data['COMPANY'] ?? '').trim() || null;
        const costCenter = String(data['COST_CENTER'] ?? '').trim() || null;
        const email = String(data['EMAIL'] ?? '').trim() || null;
        const phone = String(data['PHONE'] ?? '').trim() || null;
        const employmentStatus = (String(
          data['EMPLOYMENT_STATUS'] ?? 'ACTIVO',
        ).trim() || 'ACTIVO') as EmploymentStatus;
        const hireDate = data['HIRE_DATE']
          ? new Date(String(data['HIRE_DATE']).trim())
          : new Date();
        const hourlyRate =
          data['HOURLY_RATE'] != null && data['HOURLY_RATE'] !== ''
            ? Number(data['HOURLY_RATE'])
            : null;
        const contractType = data['CONTRACT_TYPE']
          ? (String(data['CONTRACT_TYPE']).trim() as ContractType)
          : null;
        const workScheduleName = String(data['WORK_SCHEDULE'] ?? '')
          .trim()
          .toLowerCase();
        const scheduleId = workScheduleName
          ? (scheduleMap.get(workScheduleName) ?? null)
          : null;

        const existingId = existingMap.get(docNumber);

        if (existingId) {
          if (updateExisting) {
            await tx.employee.update({
              where: { id: existingId },
              data: {
                documentType: docType,
                firstName,
                lastName,
                fullName,
                position,
                department,
                company,
                costCenter,
                email,
                phone,
                employmentStatus,
                hireDate,
                hourlyRate,
                contractType,
                scheduleId,
              },
            });
            updated++;
          }
        } else {
          await tx.employee.create({
            data: {
              documentType: docType,
              documentNumber: docNumber,
              firstName,
              lastName,
              fullName,
              position,
              department,
              company,
              costCenter,
              email,
              phone,
              employmentStatus,
              hireDate,
              hourlyRate,
              contractType,
              scheduleId,
            },
          });
          inserted++;
        }
      }
    });

    return { inserted, updated };
  }

  private async executeWorkSessionImport(
    validRows: RowValidation[],
    _autoCreateRefs: boolean,
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;

    const docNumbers = validRows.map((r) =>
      String(r.data['CEDULA EMPLEADO'] ?? '').trim(),
    );
    const employees = await this.prisma.employee.findMany({
      where: { documentNumber: { in: docNumbers } },
      select: { id: true, documentNumber: true },
    });
    const employeeMap = new Map(employees.map((e) => [e.documentNumber, e.id]));

    await this.prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const data = row.data;
        const docNumber = String(data['CEDULA EMPLEADO'] ?? '').trim();
        const employeeId = employeeMap.get(docNumber);

        if (!employeeId) {
          continue;
        }

        const fecha = new Date(String(data['FECHA']).trim());
        const start = new Date(fecha);
        start.setHours(8, 0, 0, 0);
        const end = new Date(fecha);
        end.setHours(17, 0, 0, 0);

        const exitTime = String(data['SALIDA TEORICA'] ?? '').trim();
        if (exitTime && /^\d{1,2}:\d{2}$/.test(exitTime)) {
          const [h, m] = exitTime.split(':').map(Number);
          end.setHours(h, m, 0, 0);
        }

        const totalMinutes = Math.max(
          0,
          Math.round((end.getTime() - start.getTime()) / 60000),
        );

        await tx.workSession.create({
          data: {
            employeeId,
            startTime: start,
            endTime: end,
            totalMinutes,
            ordinaryMinutes: totalMinutes,
          },
        });
        inserted++;
      }
    });

    return { inserted, updated: 0 };
  }

  generateWorkSessionTemplate(): Buffer {
    const wb = XLSX.utils.book_new();

    const wsData: (string | number)[][] = [WORK_SESSION_TEMPLATE_HEADERS];
    wsData.push([
      '2026-01-15',
      '1234567890',
      'García López María',
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
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = WORK_SESSION_TEMPLATE_HEADERS.map(() => ({ wch: 24 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Jornadas');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  generateEmployeeTemplate(): Buffer {
    const wb = XLSX.utils.book_new();

    const wsData: (string | number)[][] = [EMPLOYEE_TEMPLATE_HEADERS];
    wsData.push([
      'CC',
      '1234567890',
      'Carlos Andrés',
      'Ramírez Pérez',
      'Carlos Andrés Ramírez Pérez',
      'Desarrollador Senior',
      'Tecnología',
      'Empresa XYZ',
      'CC-001',
      'carlos.ramirez@empresa.com',
      '3001234567',
      'ACTIVO',
      '2026-01-15',
      '50000',
      'INDEFINIDO',
      'Horario Normal',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = EMPLOYEE_TEMPLATE_HEADERS.map(() => ({ wch: 24 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async exportEmployees(userId?: number): Promise<Buffer> {
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { lastName: 'asc' },
      include: { schedule: { select: { name: true } } },
    });

    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [EMPLOYEE_TEMPLATE_HEADERS];

    for (const emp of employees) {
      wsData.push([
        emp.documentType,
        emp.documentNumber,
        emp.firstName,
        emp.lastName,
        emp.fullName || `${emp.firstName} ${emp.lastName}`,
        emp.position ?? '',
        emp.department ?? '',
        emp.company ?? '',
        emp.costCenter ?? '',
        emp.email ?? '',
        emp.phone ?? '',
        emp.employmentStatus,
        emp.hireDate ? emp.hireDate.toISOString().split('T')[0] : '',
        emp.hourlyRate != null ? emp.hourlyRate : '',
        emp.contractType ?? '',
        emp.schedule?.name ?? '',
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = EMPLOYEE_TEMPLATE_HEADERS.map(() => ({ wch: 24 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');

    void this.audit.log({
      userId,
      action: 'EXPORTAR',
      entity: 'Empleado',
      newValues: { totalExported: employees.length },
    });

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async getImportHistory(query: {
    page?: number;
    limit?: number;
    module?: ImportModule;
    status?: ImportStatus;
  }) {
    const { page = 1, limit = 20, module: mod, status } = query;

    const where: Prisma.ImportHistoryWhereInput = {};
    if (mod) where.module = mod;
    if (status) where.status = status;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.importHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { errors: true } },
        },
      }),
      this.prisma.importHistory.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getImportErrors(importId: number) {
    const errors = await this.prisma.importError.findMany({
      where: { importHistoryId: importId },
      orderBy: { rowNumber: 'asc' },
    });

    return errors;
  }

  async rollbackImport(importId: number, userId?: number) {
    const importHistory = await this.prisma.importHistory.findUnique({
      where: { id: importId },
    });

    if (!importHistory) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Importación con ID ${importId} no encontrada`,
        code: 'IMPORTACION_NO_ENCONTRADA',
      });
    }

    if (importHistory.status === ImportStatus.ROLLED_BACK) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Esta importación ya fue revertida',
        code: 'IMPORTACION_YA_REVERTIDA',
      });
    }

    if (!importHistory.backupPath || !fs.existsSync(importHistory.backupPath)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No se encontró el archivo de backup para esta importación',
        code: 'BACKUP_NO_ENCONTRADO',
      });
    }

    const backupPathRef = importHistory.backupPath;

    await this.restoreBackup(importHistory.backupPath);

    void this.audit.log({
      userId,
      action: 'REVERTIR_IMPORTACION',
      entity: 'Importacion',
      entityId: importId,
      newValues: { backupPath: backupPathRef },
    });

    return { success: true, message: 'Importación revertida exitosamente' };
  }

  async generateErrorReport(importId: number): Promise<Buffer> {
    const importHistory = await this.prisma.importHistory.findUnique({
      where: { id: importId },
      include: { errors: true },
    });

    if (!importHistory) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Importación con ID ${importId} no encontrada`,
        code: 'IMPORTACION_NO_ENCONTRADA',
      });
    }

    if (importHistory.errors.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Esta importación no tiene errores registrados',
        code: 'SIN_ERRORES',
      });
    }

    const headers = [
      'Fila',
      'Columna',
      'Código',
      'Mensaje',
      'Severidad',
      'Valor Original',
    ];
    const wsData: (string | number)[][] = [headers];

    for (const error of importHistory.errors) {
      wsData.push([
        error.rowNumber,
        error.column,
        error.errorCode,
        error.message,
        error.severity,
        error.rawValue ?? '',
      ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = headers.map(() => ({ wch: 28 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Errores');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private generateErrorReportFile(
    importHistoryId: number,
    errors: Array<ValidationError & { rowNumber: number }>,
  ): string {
    const reportDir = path.join(process.cwd(), 'uploads', 'error-reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const filename = `error-report-${importHistoryId}-${Date.now()}.xlsx`;
    const filePath = path.join(reportDir, filename);

    const headers = [
      'Fila',
      'Columna',
      'Código',
      'Mensaje',
      'Severidad',
      'Valor Original',
    ];
    const wsData: (string | number)[][] = [headers];

    for (const error of errors) {
      wsData.push([
        error.rowNumber ?? 0,
        error.column,
        error.errorCode,
        error.message,
        error.severity,
        error.rawValue ?? '',
      ]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = headers.map(() => ({ wch: 28 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Errores');

    const buffer = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;
    fs.writeFileSync(filePath, buffer);

    return filePath;
  }

  private async createBackup(_userId?: number): Promise<string> {
    const dbPath = this.getDatabasePath();
    if (!dbPath) {
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'No se pudo determinar la ruta de la base de datos',
        code: 'DATABASE_PATH_ERROR',
      });
    }

    if (!fs.existsSync(dbPath)) {
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'El archivo de base de datos no existe',
        code: 'DATABASE_FILE_NOT_FOUND',
      });
    }

    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `backup-${timestamp}.db`;
    const backupPath = path.join(backupDir, backupFilename);

    await new Promise<void>((resolve, reject) => {
      fs.copyFile(dbPath, backupPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return backupPath;
  }

  private async restoreBackup(backupPath: string): Promise<void> {
    const dbPath = this.getDatabasePath();
    if (!dbPath) {
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'No se pudo determinar la ruta de la base de datos',
        code: 'DATABASE_PATH_ERROR',
      });
    }

    const resolvedBackup = path.resolve(backupPath);
    const backupsDir = path.resolve(path.dirname(dbPath), 'backups');
    if (!resolvedBackup.startsWith(backupsDir + path.sep)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Ruta de backup no permitida',
        code: 'BACKUP_RUTA_NO_PERMITIDA',
      });
    }

    if (!fs.existsSync(resolvedBackup)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El archivo de backup no existe',
        code: 'BACKUP_NO_ENCONTRADO',
      });
    }

    await this.prisma.$disconnect();

    await new Promise<void>((resolve, reject) => {
      fs.copyFile(resolvedBackup, dbPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await this.prisma.$connect();
  }

  private readFileFromPath(filePath: string): Buffer {
    if (!filePath) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No se proporcionó ruta de archivo',
        code: 'RUTA_REQUERIDA',
      });
    }

    const resolved = path.resolve(filePath);
    const uploadsDir = path.resolve(process.cwd(), 'uploads', 'imports');

    if (
      !resolved.startsWith(uploadsDir + path.sep) &&
      resolved !== uploadsDir
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Ruta de archivo no permitida',
        code: 'RUTA_NO_PERMITIDA',
      });
    }

    if (!fs.existsSync(resolved)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El archivo no existe',
        code: 'ARCHIVO_NO_ENCONTRADO',
      });
    }

    return fs.readFileSync(resolved);
  }

  private getDatabasePath(): string {
    const dbUrl = process.env.DATABASE_URL ?? '';
    if (!dbUrl.startsWith('file:')) {
      return '';
    }

    let filePath = dbUrl.replace('file:', '');

    if (filePath.startsWith('./')) {
      filePath = path.join(process.cwd(), 'prisma', filePath.slice(2));
    } else if (filePath.startsWith('../')) {
      filePath = path.join(process.cwd(), 'prisma', filePath);
    } else if (!path.isAbsolute(filePath)) {
      filePath = path.join(process.cwd(), 'prisma', filePath);
    }

    return path.resolve(filePath);
  }
}
