import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LaborEngineService } from '../labor-engine/labor-engine.service';
import { PreviewImportDto } from './dto/preview-import.dto';
import { ExecuteImportDto } from './dto/execute-import.dto';
import {
  Prisma,
  ImportModule,
  ImportStatus,
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
  'Postulado_nombre',
  'Cargo',
  'Documento',
  'Contacto',
];

export function parseColombianName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const n = parts.length;
  if (n === 0) return { firstName: '', lastName: '' };
  if (n === 1) return { firstName: parts[0], lastName: '' };
  if (n === 2) return { firstName: parts[0], lastName: parts[1] };
  if (n === 3) return { firstName: parts[0], lastName: `${parts[1]} ${parts[2]}` };
  const splitPoint = Math.ceil(n / 2);
  return {
    firstName: parts.slice(0, splitPoint).join(' '),
    lastName: parts.slice(splitPoint).join(' '),
  };
}

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

const WORKDAY_RAW_TEMPLATE_HEADERS = [
  'CEDULA EMPLEADO',
  'FECHA INICIO',
  'HORA INICIO',
  'FECHA FIN',
  'HORA FIN',
];

const ALLOWED_IMPORT_MIME_TYPES_BY_EXTENSION: Record<string, string[]> = {
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls': ['application/vnd.ms-excel'],
};


@Injectable()
export class ImportService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private engine: LaborEngineService,
  ) {}

  handleFileUpload(file: {
    buffer: Buffer;
    originalname: string;
    size: number;
    mimetype: string;
  }) {
    const extension = path.extname(file.originalname ?? '').toLowerCase();
    const allowedMimeTypes = ALLOWED_IMPORT_MIME_TYPES_BY_EXTENSION[extension];

    if (!allowedMimeTypes) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'La extensión del archivo no está permitida. Use .xlsx o .xls',
        code: 'EXTENSION_ARCHIVO_INVALIDA',
      });
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El tipo MIME del archivo no corresponde a un archivo Excel permitido',
        code: 'TIPO_MIME_INVALIDO',
      });
    }

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
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
    return this.mapColumnsToStandard(rawRows);
  }

  private detectFormat(headers: string[]): 'bd_personas_ep' | 'standard' {
    const lower = headers.map((h) => h.trim().toLowerCase());
    if (lower.includes('postulado_nombre_depurado')) {
      return 'bd_personas_ep';
    }
    return 'standard';
  }

  private mapColumnsToStandard(rows: Record<string, string>[]): Record<string, string>[] {
    if (rows.length === 0) return rows;

    const firstRow = rows[0];
    const headers = Object.keys(firstRow);
    const format = this.detectFormat(headers);

    if (format === 'standard') return rows;

    return rows.map((row) => {
      const mapped: Record<string, string> = {};
      mapped['Postulado_nombre'] = String(row['Postulado_nombre_depurado'] ?? row['postulado_nombre_depurado'] ?? '').trim();
      mapped['Cargo'] = String(row['Cargo'] ?? row['cargo'] ?? '').trim();
      mapped['Documento'] = String(row['Documento'] ?? row['documento'] ?? '').trim();
      mapped['Contacto'] = String(row['Contacto'] ?? row['contacto'] ?? '').trim();
      return mapped;
    });
  }

  private validateEmployeeRow(
    row: Record<string, string>,
    index: number,
    seenDocNumbers: Map<string, number>,
  ): RowValidation {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const nombre = String(row['Postulado_nombre'] ?? '').trim();
    if (!nombre) {
      errors.push({
        column: 'Postulado_nombre',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El nombre del postulado es obligatorio',
        severity: 'error',
      });
    }

    const cargo = String(row['Cargo'] ?? '').trim();
    if (!cargo) {
      errors.push({
        column: 'Cargo',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El cargo es obligatorio',
        severity: 'error',
      });
    }

    const documento = String(row['Documento'] ?? '').trim();
    if (!documento) {
      errors.push({
        column: 'Documento',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El número de documento es obligatorio',
        severity: 'error',
      });
    } else if (documento.length > 30) {
      errors.push({
        column: 'Documento',
        errorCode: 'LONGITUD_INVALIDA',
        message: 'El número de documento no puede exceder 30 caracteres',
        severity: 'error',
        rawValue: documento,
      });
    } else if (seenDocNumbers.has(documento)) {
      errors.push({
        column: 'Documento',
        errorCode: 'DUPLICADO_ARCHIVO',
        message: `Número de documento duplicado en la fila ${seenDocNumbers.get(documento)}`,
        severity: 'error',
        rawValue: documento,
      });
    } else {
      seenDocNumbers.set(documento, index + 2);
    }

    const contacto = String(row['Contacto'] ?? '').trim();
    if (!contacto) {
      errors.push({
        column: 'Contacto',
        errorCode: 'CAMPO_REQUERIDO',
        message: 'El contacto es obligatorio',
        severity: 'error',
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
    } else if (!this.isValidDateOnly(fecha)) {
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

  private validateWorkdayRawRow(
    row: Record<string, string>,
    index: number,
  ): RowValidation {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const docNumber = String(row['CEDULA EMPLEADO'] ?? '').trim();
    if (!docNumber) {
      errors.push({ column: 'CEDULA EMPLEADO', errorCode: 'CAMPO_REQUERIDO', message: 'La cédula del empleado es obligatoria', severity: 'error' });
    }

    const startDate = String(row['FECHA INICIO'] ?? '').trim();
    if (!startDate) {
      errors.push({ column: 'FECHA INICIO', errorCode: 'CAMPO_REQUERIDO', message: 'La fecha de inicio es obligatoria', severity: 'error' });
    } else if (!this.isValidDateOnly(startDate)) {
      errors.push({ column: 'FECHA INICIO', errorCode: 'FECHA_INVALIDA', message: 'El formato de fecha de inicio no es válido', severity: 'error', rawValue: startDate });
    }

    const startTime = String(row['HORA INICIO'] ?? '').trim();
    if (!startTime) {
      errors.push({ column: 'HORA INICIO', errorCode: 'CAMPO_REQUERIDO', message: 'La hora de inicio es obligatoria', severity: 'error' });
    } else if (!/^\d{1,2}:\d{2}$/.test(startTime)) {
      errors.push({ column: 'HORA INICIO', errorCode: 'FORMATO_INVALIDO', message: 'La hora de inicio debe tener formato HH:MM', severity: 'error', rawValue: startTime });
    }

    const endDate = String(row['FECHA FIN'] ?? '').trim();
    if (!endDate) {
      errors.push({ column: 'FECHA FIN', errorCode: 'CAMPO_REQUERIDO', message: 'La fecha de fin es obligatoria', severity: 'error' });
    } else if (!this.isValidDateOnly(endDate)) {
      errors.push({ column: 'FECHA FIN', errorCode: 'FECHA_INVALIDA', message: 'El formato de fecha de fin no es válido', severity: 'error', rawValue: endDate });
    }

    const endTime = String(row['HORA FIN'] ?? '').trim();
    if (!endTime) {
      errors.push({ column: 'HORA FIN', errorCode: 'CAMPO_REQUERIDO', message: 'La hora de fin es obligatoria', severity: 'error' });
    } else if (!/^\d{1,2}:\d{2}$/.test(endTime)) {
      errors.push({ column: 'HORA FIN', errorCode: 'FORMATO_INVALIDO', message: 'La hora de fin debe tener formato HH:MM', severity: 'error', rawValue: endTime });
    }

    if (errors.length === 0 && startDate && endDate && startTime && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      if (end.getTime() - start.getTime() <= 0) {
        errors.push({ column: 'FECHA FIN', errorCode: 'RANGO_INVALIDO', message: 'La fecha/hora de fin debe ser posterior a la de inicio', severity: 'error' });
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

  private isValidDateOnly(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  previewImport(dto: PreviewImportDto): PreviewResult {
    try {
      const buffer = this.readFileFromPath(dto.filePath);
      const filename = path.basename(dto.filePath);

      let rows: Record<string, string>[];
      try {
        rows = this.parseFile(buffer);
      } catch (parseError) {
        throw new BadRequestException({
          statusCode: 400,
          message: `Error al parsear el archivo: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          code: 'ARCHIVO_CORRUPTO',
        });
      }

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
        } else if (dto.module === ImportModule.WORKDAYS) {
          validations.push(this.validateWorkdayRawRow(rows[i], i));
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
    } catch (error) {
      console.error(`[IMPORT-PREVIEW] Error during validation:`, error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        statusCode: 400,
        message: `Error inesperado durante la validación: ${error instanceof Error ? error.message : String(error)}`,
        code: 'VALIDACION_ERROR',
      });
    }
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
      } else if (dto.module === ImportModule.WORKDAYS) {
        validations.push(this.validateWorkdayRawRow(rows[i], i));
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
      } else if (dto.module === ImportModule.WORKDAYS) {
        const result = await this.executeWorkdayRawImport(validRows);
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

    const workConfigs = await this.prisma.workConfig.findMany({
      select: { id: true, name: true },
    });
    const workConfigMap = new Map(
      workConfigs.map((w) => [w.name.toLowerCase(), w.id]),
    );

    const defaultScheduleId = scheduleMap.get('administrativo')
      ?? scheduleMap.get('horario administrativo')
      ?? schedules.find((s) => s.name.toLowerCase().includes('administrativ'))?.id
      ?? schedules[0]?.id
      ?? null;

    const defaultWorkConfigId = workConfigMap.get('administrativo')
      ?? workConfigMap.get('administrativo (admin)')
      ?? workConfigs.find((w) => w.name.toLowerCase().includes('administrativ'))?.id
      ?? workConfigs[0]?.id
      ?? null;

    const firstEmployee = await this.prisma.employee.findFirst({
      select: { company: true },
      where: { company: { not: null } },
    });
    const defaultCompany = firstEmployee?.company ?? '';

    const docNumbers = validRows.map((r) =>
      String(r.data['Documento'] ?? '').trim(),
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

        const nombreRaw = String(data['Postulado_nombre'] ?? '').trim();
        const { firstName, lastName } = parseColombianName(nombreRaw);

        const documento = String(data['Documento'] ?? '').trim();
        const cargo = String(data['Cargo'] ?? '').trim() || null;
        const contacto = String(data['Contacto'] ?? '').trim();

        const isEmail = contacto.includes('@');
        const email = isEmail ? contacto : null;
        const phone = isEmail ? null : contacto;

        const employeeData = {
          documentType: 'CC' as const,
          documentNumber: documento,
          firstName,
          lastName,
          fullName: nombreRaw,
          position: cargo,
          email,
          phone,
          department: 'Administrativo',
          company: defaultCompany,
          costCenter: 'Default',
          employmentStatus: 'ACTIVO' as const,
          contractType: 'INDEFINIDO' as const,
          hireDate: new Date(),
          hourlyRate: null as number | null,
          scheduleId: defaultScheduleId,
          workConfigId: defaultWorkConfigId,
        };

        const existingId = existingMap.get(documento);

        if (existingId) {
          if (updateExisting) {
            await tx.employee.update({
              where: { id: existingId },
              data: employeeData,
            });
            updated++;
          }
        } else {
          await tx.employee.create({
            data: employeeData,
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
      select: {
        id: true,
        documentNumber: true,
        workModality: true,
        weeklyTargetMinutes: true,
        workConfig: { include: { ordinaryDistributions: true } },
      },
    });
    const employeeMap = new Map(employees.map((e) => [e.documentNumber, e]));

    const holidays = await this.prisma.holiday.findMany({
      select: { date: true },
    });
    const holidayDates = holidays.map((h) => h.date);

    await this.prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const data = row.data;
        const docNumber = String(data['CEDULA EMPLEADO'] ?? '').trim();
        const employee = employeeMap.get(docNumber);

        if (!employee) {
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

        const config = employee.workConfig;
        const ordinaryDistributions =
          config?.ordinaryDistributions?.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            ordinaryMinutesCap: d.ordinaryMinutesCap,
          })) ?? [];

        const classification = this.engine.classify({
          startTime: start,
          endTime: end,
          ordinaryDistributions,
          holidays: holidayDates,
          workModality: employee.workModality,
          weeklyTargetMinutes:
            employee.weeklyTargetMinutes ?? config?.weeklyTargetMinutes ?? 2520,
          accumulatedWeekMinutes: 0,
          breakMinutes: config?.breakMinutes ?? 60,
          breakThresholdMinutes: config?.breakThresholdMinutes ?? null,
        });

        const c = classification;
        await tx.workSession.create({
          data: {
            employeeId: employee.id,
            startTime: start,
            endTime: end,
            totalMinutes: c.totalMinutes,
            ordinaryMinutes: c.ordinarioDiurno + c.ordinarioNocturno,
            nightSurchargeMinutes: c.ordinarioNocturno,
            extraDayMinutes: c.extraDiurno,
            extraNightMinutes: c.extraNocturno,
            sundayMinutes: c.dominicalDiurno + c.dominicalNocturno,
            holidayMinutes: c.festivoDiurno + c.festivoNocturno,
            extraHolidayDayMinutes: c.extraDominicalFestivoDiurno,
            extraHolidayNightMinutes: c.extraDominicalFestivoNocturno,
            sundayNightSurchargeMinutes:
              c.dominicalNocturno + c.festivoNocturno,
          },
        });
        inserted++;
      }
    });

    return { inserted, updated: 0 };
  }

  private async executeWorkdayRawImport(
    validRows: RowValidation[],
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;

    const docNumbers = validRows.map((r) =>
      String(r.data['CEDULA EMPLEADO'] ?? '').trim(),
    );
    const employees = await this.prisma.employee.findMany({
      where: { documentNumber: { in: docNumbers } },
      select: {
        id: true,
        documentNumber: true,
        workModality: true,
        workConfig: { include: { ordinaryDistributions: true } },
      },
    });
    const employeeMap = new Map(employees.map((e) => [e.documentNumber, e]));

    const holidays = await this.prisma.holiday.findMany({
      select: { date: true },
    });
    const holidayDates = holidays.map((h) => h.date);

    await this.prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const data = row.data;
        const docNumber = String(data['CEDULA EMPLEADO'] ?? '').trim();
        const employee = employeeMap.get(docNumber);
        if (!employee) continue;

        const startDate = String(data['FECHA INICIO'] ?? '').trim();
        const startTime = String(data['HORA INICIO'] ?? '').trim();
        const endDate = String(data['FECHA FIN'] ?? '').trim();
        const endTime = String(data['HORA FIN'] ?? '').trim();

        const start = new Date(`${startDate}T${startTime}`);
        const end = new Date(`${endDate}T${endTime}`);

        const config = employee.workConfig;
        const ordinaryDistributions =
          config?.ordinaryDistributions?.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            ordinaryMinutesCap: d.ordinaryMinutesCap,
          })) ?? [];

        const classification = this.engine.classify({
          startTime: start,
          endTime: end,
          ordinaryDistributions,
          holidays: holidayDates,
          workModality: employee.workModality ?? 'TERRITORIO',
          weeklyTargetMinutes: config?.weeklyTargetMinutes ?? 2520,
          accumulatedWeekMinutes: 0,
          breakMinutes: config?.breakMinutes ?? 60,
          breakThresholdMinutes: config?.breakThresholdMinutes ?? null,
        });

        const c = classification;
        await tx.workSession.create({
          data: {
            employeeId: employee.id,
            startTime: start,
            endTime: end,
            totalMinutes: c.totalMinutes,
            ordinaryMinutes: c.ordinarioDiurno + c.ordinarioNocturno,
            nightSurchargeMinutes: c.ordinarioNocturno,
            extraDayMinutes: c.extraDiurno,
            extraNightMinutes: c.extraNocturno,
            sundayMinutes: c.dominicalDiurno + c.dominicalNocturno,
            holidayMinutes: c.festivoDiurno + c.festivoNocturno,
            extraHolidayDayMinutes: c.extraDominicalFestivoDiurno,
            extraHolidayNightMinutes: c.extraDominicalFestivoNocturno,
            sundayNightSurchargeMinutes:
              c.dominicalNocturno + c.festivoNocturno,
          },
        });
        inserted++;
      }
    });

    return { inserted, updated: 0 };
  }

  generateBdPersonasEpTemplate(): Buffer {
    const headers = [
      'Postulado_nombre_depurado',
      'Cargo',
      'Documento',
      'Contacto',
    ];

    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [headers];
    wsData.push([
      'Carlos Andrés Ramírez Pérez',
      'Desarrollador Senior',
      '1234567890',
      '3001234567',
    ]);
    wsData.push([
      'María García López',
      'Analista de Recursos Humanos',
      '9876543210',
      '3109876543',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = headers.map(() => ({ wch: 30 }));

    XLSX.utils.book_append_sheet(wb, ws, 'BD Personas EP');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
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

  generateWorkdayTemplate(): Buffer {
    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [WORKDAY_RAW_TEMPLATE_HEADERS];
    wsData.push([
      '1234567890',
      '2026-07-08',
      '21:30',
      '2026-07-09',
      '06:30',
    ]);
    wsData.push([
      '9876543210',
      '2026-07-08',
      '07:00',
      '2026-07-08',
      '17:00',
    ]);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = WORKDAY_RAW_TEMPLATE_HEADERS.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Jornadas');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  generateEmployeeTemplate(): Buffer {
    const wb = XLSX.utils.book_new();

    const wsData: (string | number)[][] = [EMPLOYEE_TEMPLATE_HEADERS];
    wsData.push([
      'Carlos Andrés Ramírez Pérez',
      'Desarrollador Senior',
      '1234567890',
      '3001234567',
    ]);
    wsData.push([
      'María García López',
      'Analista de Recursos Humanos',
      '9876543210',
      'maria.garcia@empresa.com',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = EMPLOYEE_TEMPLATE_HEADERS.map(() => ({ wch: 30 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async exportEmployees(userId?: number): Promise<Buffer> {
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { lastName: 'asc' },
    });

    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [EMPLOYEE_TEMPLATE_HEADERS];

    for (const emp of employees) {
      const nombre = emp.fullName || `${emp.firstName} ${emp.lastName}`;
      const contacto = emp.email || emp.phone || '';
      wsData.push([
        nombre,
        emp.position ?? '',
        emp.documentNumber,
        contacto,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = EMPLOYEE_TEMPLATE_HEADERS.map(() => ({ wch: 30 }));

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

    await this.prisma.importHistory.upsert({
      where: { id: importId },
      update: { status: ImportStatus.ROLLED_BACK },
      create: {
        id: importHistory.id,
        module: importHistory.module,
        filename: importHistory.filename,
        fileSize: importHistory.fileSize,
        filePath: importHistory.filePath,
        status: ImportStatus.ROLLED_BACK,
        totalRows: importHistory.totalRows,
        insertedRows: importHistory.insertedRows,
        updatedRows: importHistory.updatedRows,
        errorRows: importHistory.errorRows,
        warningRows: importHistory.warningRows,
        durationMs: importHistory.durationMs,
        backupPath: backupPathRef,
        errorReportPath: importHistory.errorReportPath,
        userId: importHistory.userId,
        autoCreateRefs: importHistory.autoCreateRefs,
        updateExisting: importHistory.updateExisting,
        dryRun: importHistory.dryRun,
        createdAt: importHistory.createdAt,
      },
    });

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
