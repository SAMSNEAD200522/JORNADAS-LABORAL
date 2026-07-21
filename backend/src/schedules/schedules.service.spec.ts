import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from './schedules.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('SchedulesService', () => {
  let service: SchedulesService;

  const mockPrisma = {
    schedule: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    scheduleDay: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
  });

  const sampleSchedule = { id: 1, name: 'Administrativo', startTime: '07:00', endTime: '17:00', workDays: '1,2,3,4,5', breakMinutes: 60, isActive: true, createdAt: new Date(), updatedAt: new Date() };

  describe('create', () => {
    const dto = { name: 'Administrativo', startTime: '07:00', endTime: '17:00', workDays: '1,2,3,4,5', breakMinutes: 60 };

    it('debe crear un horario exitosamente', async () => {
      mockPrisma.schedule.create.mockResolvedValue({ id: 1, ...dto, isActive: true });
      const result = await service.create(dto as any);
      expect(result).toHaveProperty('id', 1);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREAR', entity: 'Horario' }));
    });

    it('debe rechazar nombre duplicado (P2002)', async () => {
      const prismaError = Object.assign(new Error('Unique'), { code: 'P2002', clientVersion: '6.0' });
      mockPrisma.schedule.create.mockRejectedValue(prismaError);
      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    });

    it('debe lanzar código HORARIO_DUPLICADO', async () => {
      const prismaError = Object.assign(new Error('Unique'), { code: 'P2002', clientVersion: '6.0' });
      mockPrisma.schedule.create.mockRejectedValue(prismaError);
      try {
        await service.create(dto as any);
      } catch (e) {
        const response = (e as ConflictException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('HORARIO_DUPLICADO');
      }
    });

    it('debe relanzar errores que no son P2002', async () => {
      const otherError = Object.assign(new Error('DB error'), { code: 'P1000', clientVersion: '6.0' });
      mockPrisma.schedule.create.mockRejectedValue(otherError);
      await expect(service.create(dto as any)).rejects.toThrow('DB error');
    });
  });

  describe('findAll', () => {
    it('debe retornar lista de horarios', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([{ id: 1, name: 'Test', _count: { employees: 0 } }]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name', 'Test');
    });

    it('debe retornar array vacío si no hay horarios', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toHaveLength(0);
    });

    it('debe incluir conteo de empleados', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([{ id: 1, _count: { employees: 5 } }]);
      const result = await service.findAll();
      expect(result[0]._count.employees).toBe(5);
    });
  });

  describe('findOne', () => {
    it('debe retornar horario por id', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, name: 'Test', _count: { employees: 0 } });
      const result = await service.findOne(1);
      expect(result).toHaveProperty('id', 1);
    });

    it('debe lanzar 404 si no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar código HORARIO_NO_ENCONTRADO', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      try {
        await service.findOne(999);
      } catch (e) {
        const response = (e as NotFoundException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('HORARIO_NO_ENCONTRADO');
      }
    });
  });

  describe('update', () => {
    it('debe actualizar un horario', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, name: 'Test', _count: { employees: 0 } });
      mockPrisma.schedule.findFirst.mockResolvedValue(null);
      mockPrisma.schedule.update.mockResolvedValue({ id: 1, name: 'Actualizado' });
      const result = await service.update(1, { name: 'Actualizado' } as any);
      expect(result).toHaveProperty('name', 'Actualizado');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTUALIZAR' }));
    });

    it('debe rechazar nombre duplicado en update', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, name: 'Test', _count: { employees: 0 } });
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: 2, name: 'Otro' });
      await expect(service.update(1, { name: 'Otro' } as any)).rejects.toThrow(ConflictException);
    });

    it('debe permitir actualizar sin cambiar nombre', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, name: 'Original', _count: { employees: 0 } });
      mockPrisma.schedule.update.mockResolvedValue({ id: 1, startTime: '08:00' });
      const result = await service.update(1, { startTime: '08:00' } as any);
      expect(result).toHaveProperty('startTime', '08:00');
      expect(mockPrisma.schedule.findFirst).not.toHaveBeenCalled();
    });

    it('debe rechazar si el horario no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleStatus', () => {
    it('debe alternar de activo a inactivo', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, isActive: true, _count: { employees: 0 } });
      mockPrisma.schedule.update.mockResolvedValue({ id: 1, isActive: false, _count: { employees: 0 } });
      const result = await service.toggleStatus(1);
      expect(result).toHaveProperty('isActive', false);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DESACTIVAR' }));
    });

    it('debe alternar de inactivo a activo', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, isActive: false, _count: { employees: 0 } });
      mockPrisma.schedule.update.mockResolvedValue({ id: 1, isActive: true, _count: { employees: 0 } });
      const result = await service.toggleStatus(1);
      expect(result).toHaveProperty('isActive', true);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVAR' }));
    });

    it('debe rechazar si el horario no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      await expect(service.toggleStatus(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignToEmployee', () => {
    it('debe asignar horario a empleado', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, name: 'Admin' });
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.employee.update.mockResolvedValue({ id: 1, scheduleId: 1, schedule: { id: 1 } });
      const result = await service.assignToEmployee(1, 1);
      expect(result).toHaveProperty('scheduleId', 1);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ASIGNAR_HORARIO' }));
    });

    it('debe lanzar 404 si el horario no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      await expect(service.assignToEmployee(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar 404 si el empleado no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, name: 'X' });
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.assignToEmployee(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar código EMPLEADO_NO_ENCONTRADO', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, name: 'X' });
      mockPrisma.employee.findUnique.mockResolvedValue(null);
      try {
        await service.assignToEmployee(1, 999);
      } catch (e) {
        const response = (e as NotFoundException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('EMPLEADO_NO_ENCONTRADO');
      }
    });
  });

  describe('createDay', () => {
    const dayDto = { dayOfWeek: 1, startTime: '07:00', endTime: '17:00', breakMinutes: 60 };

    it('debe crear/actualizar un día del horario', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.scheduleDay.upsert.mockResolvedValue({ id: 1, scheduleId: 1, ...dayDto });
      const result = await service.createDay(1, dayDto as any);
      expect(result).toHaveProperty('scheduleId', 1);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREAR_ACTUALIZAR_DIA_HORARIO' }));
    });

    it('debe rechazar si el horario no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      await expect(service.createDay(999, dayDto as any)).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar si hora salida <= hora entrada', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1 });
      await expect(service.createDay(1, { ...dayDto, startTime: '17:00', endTime: '07:00' } as any)).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar si hora salida == hora entrada', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1 });
      await expect(service.createDay(1, { ...dayDto, startTime: '07:00', endTime: '07:00' } as any)).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar código HORAS_INVALIDAS cuando horas son inválidas', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1 });
      try {
        await service.createDay(1, { ...dayDto, startTime: '18:00', endTime: '06:00' } as any);
      } catch (e) {
        const response = (e as BadRequestException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('HORAS_INVALIDAS');
      }
    });
  });

  describe('findDays', () => {
    it('debe retornar los días de un horario', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, _count: { employees: 0 } });
      mockPrisma.scheduleDay.findMany.mockResolvedValue([
        { scheduleId: 1, dayOfWeek: 1, startTime: '07:00', endTime: '17:00' },
        { scheduleId: 1, dayOfWeek: 2, startTime: '07:00', endTime: '17:00' },
      ]);
      const result = await service.findDays(1);
      expect(result).toHaveLength(2);
    });

    it('debe rechazar si el horario no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      await expect(service.findDays(999)).rejects.toThrow(NotFoundException);
    });

    it('debe retornar array vacío si no hay días configurados', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, _count: { employees: 0 } });
      mockPrisma.scheduleDay.findMany.mockResolvedValue([]);
      const result = await service.findDays(1);
      expect(result).toHaveLength(0);
    });
  });

  describe('removeDay', () => {
    it('debe eliminar un día del horario', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, _count: { employees: 0 } });
      mockPrisma.scheduleDay.findUnique.mockResolvedValue({ scheduleId: 1, dayOfWeek: 1 });
      mockPrisma.scheduleDay.delete.mockResolvedValue({});
      await service.removeDay(1, 1);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ELIMINAR_DIA_HORARIO' }));
    });

    it('debe rechazar si el horario no existe', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      await expect(service.removeDay(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar si el día no está configurado', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, _count: { employees: 0 } });
      mockPrisma.scheduleDay.findUnique.mockResolvedValue(null);
      await expect(service.removeDay(1, 5)).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar código DIA_NO_ENCONTRADO', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, _count: { employees: 0 } });
      mockPrisma.scheduleDay.findUnique.mockResolvedValue(null);
      try {
        await service.removeDay(1, 5);
      } catch (e) {
        const response = (e as NotFoundException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('DIA_NO_ENCONTRADO');
      }
    });

    it('debe registrar oldValues con dayOfWeek', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 1, _count: { employees: 0 } });
      mockPrisma.scheduleDay.findUnique.mockResolvedValue({ scheduleId: 1, dayOfWeek: 3 });
      mockPrisma.scheduleDay.delete.mockResolvedValue({});
      await service.removeDay(1, 3);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ oldValues: { dayOfWeek: 3 } }),
      );
    });
  });
});
