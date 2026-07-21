import { Test, TestingModule } from '@nestjs/testing';
import { WorkConfigService } from './work-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { WorkModality } from '@prisma/client';
import { CreateWorkConfigDto } from './dto/create-work-config.dto';
import { UpdateWorkConfigDto } from './dto/update-work-config.dto';
import { CreateOrdinaryDistributionDto } from './dto/create-ordinary-distribution.dto';

describe('WorkConfigService', () => {
  let service: WorkConfigService;

  const mockWorkConfig = {
    id: 1,
    name: 'Turno Mañana',
    description: 'Jornada de mañana',
    modality: 'FIJA',
    breakMinutes: 60,
    breakThresholdMinutes: 300,
    weeklyTargetMinutes: 2520,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockDistributions = [
    { id: 1, workConfigId: 1, dayOfWeek: 1, ordinaryMinutesCap: 480 },
    { id: 2, workConfigId: 1, dayOfWeek: 2, ordinaryMinutesCap: 480 },
  ];

  const mockEmployee = {
    id: 10,
    name: 'Juan Pérez',
    workConfigId: null,
  };

  const mockAuditService = { log: jest.fn() };

  const mockPrismaService = {
    workConfig: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    ordinaryDistribution: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    employee: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkConfigService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<WorkConfigService>(WorkConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateWorkConfigDto = {
      name: 'Turno Mañana',
      description: 'Jornada de mañana',
      modality: WorkModality.ADMINISTRATIVO,
      breakMinutes: 60,
      breakThresholdMinutes: 300,
      weeklyTargetMinutes: 2520,
    };

    it('debería crear una configuración exitosamente', async () => {
      mockPrismaService.workConfig.create.mockResolvedValue(mockWorkConfig);

      const result = await service.create(dto, 1);

      expect(mockPrismaService.workConfig.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          description: dto.description,
          modality: dto.modality,
          breakMinutes: dto.breakMinutes,
          breakThresholdMinutes: dto.breakThresholdMinutes,
          weeklyTargetMinutes: dto.weeklyTargetMinutes,
        },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 1,
        action: 'CREAR',
        entity: 'ConfiguracionLaboral',
        entityId: mockWorkConfig.id,
        newValues: dto,
      });
      expect(result).toEqual(mockWorkConfig);
    });

    it('debería usar valores por defecto cuando breakMinutes y weeklyTargetMinutes no se proporcionan', async () => {
      const dtoSinDefaults: CreateWorkConfigDto = {
        name: 'Turno Tarde',
        description: 'Jornada de tarde',
        modality: WorkModality.TERRITORIO,
        breakThresholdMinutes: 300,
      };
      mockPrismaService.workConfig.create.mockResolvedValue({
        ...mockWorkConfig,
        breakMinutes: 60,
        weeklyTargetMinutes: 2520,
      });

      await service.create(dtoSinDefaults, 1);

      expect(mockPrismaService.workConfig.create).toHaveBeenCalledWith({
        data: {
          name: dtoSinDefaults.name,
          description: dtoSinDefaults.description,
          modality: dtoSinDefaults.modality,
          breakMinutes: 60,
          breakThresholdMinutes: dtoSinDefaults.breakThresholdMinutes,
          weeklyTargetMinutes: 2520,
        },
      });
    });

    it('debería lanzar ConflictException si el nombre ya existe (P2002)', async () => {
      const error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      mockPrismaService.workConfig.create.mockRejectedValue(error);

      await expect(service.create(dto, 1)).rejects.toThrow(ConflictException);
      await expect(service.create(dto, 1)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CONFIG_NOMBRE_DUPLICADO',
        }),
      });
    });

    it('debería re-lanzar errores que no sean P2002', async () => {
      const error = new Error('Database connection failed');
      mockPrismaService.workConfig.create.mockRejectedValue(error);

      await expect(service.create(dto, 1)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('debería crear sin userId', async () => {
      mockPrismaService.workConfig.create.mockResolvedValue(mockWorkConfig);

      const result = await service.create(dto);

      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: undefined,
        action: 'CREAR',
        entity: 'ConfiguracionLaboral',
        entityId: mockWorkConfig.id,
        newValues: dto,
      });
      expect(result).toEqual(mockWorkConfig);
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debería retornar todas las configuraciones con distribuciones', async () => {
      const data = [
        {
          ...mockWorkConfig,
          _count: { employees: 3 },
          ordinaryDistributions: mockDistributions,
        },
      ];
      mockPrismaService.workConfig.findMany.mockResolvedValue(data);

      const result = await service.findAll();

      expect(mockPrismaService.workConfig.findMany).toHaveBeenCalledWith({
        include: {
          _count: { select: { employees: true } },
          ordinaryDistributions: { orderBy: { dayOfWeek: 'asc' } },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(data);
      expect(result).toHaveLength(1);
      expect(result[0].ordinaryDistributions).toHaveLength(2);
    });

    it('debería retornar array vacío si no hay configuraciones', async () => {
      mockPrismaService.workConfig.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debería retornar una configuración por ID', async () => {
      const data = {
        ...mockWorkConfig,
        ordinaryDistributions: mockDistributions,
      };
      mockPrismaService.workConfig.findUnique.mockResolvedValue(data);

      const result = await service.findOne(1);

      expect(mockPrismaService.workConfig.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          ordinaryDistributions: { orderBy: { dayOfWeek: 'asc' } },
        },
      });
      expect(result).toEqual(data);
    });

    it('debería lanzar NotFoundException si la configuración no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CONFIG_NO_ENCONTRADA',
        }),
      });
    });
  });

  // ─── update ──────────────────────────────────────────────────────

  describe('update', () => {
    const dto: UpdateWorkConfigDto = {
      name: 'Turno Mañana Modificado',
      description: 'Descripción actualizada',
    };

    it('debería actualizar una configuración exitosamente', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.workConfig.findFirst.mockResolvedValue(null);
      const updated = { ...mockWorkConfig, ...dto };
      mockPrismaService.workConfig.update.mockResolvedValue(updated);

      const result = await service.update(1, dto, 1);

      expect(mockPrismaService.workConfig.findUnique).toHaveBeenCalled();
      expect(mockPrismaService.workConfig.findFirst).toHaveBeenCalledWith({
        where: { name: dto.name, id: { not: 1 } },
      });
      expect(mockPrismaService.workConfig.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          name: dto.name,
          description: dto.description,
          modality: undefined,
          breakMinutes: undefined,
          breakThresholdMinutes: undefined,
          weeklyTargetMinutes: undefined,
        },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 1,
        action: 'ACTUALIZAR',
        entity: 'ConfiguracionLaboral',
        entityId: 1,
        newValues: dto,
      });
      expect(result).toEqual(updated);
    });

    it('debería lanzar ConflictException si el nombre ya existe en otra configuración', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.workConfig.findFirst.mockResolvedValue({
        id: 2,
        name: dto.name,
      });

      await expect(service.update(1, dto, 1)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.update(1, dto, 1)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CONFIG_NOMBRE_DUPLICADO',
        }),
      });
    });

    it('debería permitir actualizar sin cambiar el nombre (sin verificar duplicado)', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      const dtoSinNombre: UpdateWorkConfigDto = {
        description: 'Solo cambio descripción',
      };
      const updated = { ...mockWorkConfig, description: dtoSinNombre.description };
      mockPrismaService.workConfig.update.mockResolvedValue(updated);

      await service.update(1, dtoSinNombre, 1);

      expect(mockPrismaService.workConfig.findFirst).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si la configuración no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(null);

      await expect(service.update(999, dto, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── toggleStatus ────────────────────────────────────────────────

  describe('toggleStatus', () => {
    it('debería desactivar una configuración activa', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.workConfig.update.mockResolvedValue({
        ...mockWorkConfig,
        isActive: false,
      });

      const result = await service.toggleStatus(1, 1);

      expect(mockPrismaService.workConfig.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 1,
        action: 'DESACTIVAR',
        entity: 'ConfiguracionLaboral',
        entityId: 1,
        newValues: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('debería activar una configuración inactiva', async () => {
      const inactiveConfig = { ...mockWorkConfig, isActive: false };
      mockPrismaService.workConfig.findUnique.mockResolvedValue(inactiveConfig);
      mockPrismaService.workConfig.update.mockResolvedValue({
        ...inactiveConfig,
        isActive: true,
      });

      const result = await service.toggleStatus(1, 1);

      expect(mockPrismaService.workConfig.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: true },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 1,
        action: 'ACTIVAR',
        entity: 'ConfiguracionLaboral',
        entityId: 1,
        newValues: { isActive: true },
      });
      expect(result.isActive).toBe(true);
    });

    it('debería lanzar NotFoundException si la configuración no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(null);

      await expect(service.toggleStatus(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── assignToEmployee ────────────────────────────────────────────

  describe('assignToEmployee', () => {
    it('debería asignar configuración a un empleado exitosamente', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.employee.findUnique.mockResolvedValue(mockEmployee);
      const updatedEmployee = { ...mockEmployee, workConfigId: 1 };
      mockPrismaService.employee.update.mockResolvedValue(updatedEmployee);

      const result = await service.assignToEmployee(1, 10, 1);

      expect(mockPrismaService.employee.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
      });
      expect(mockPrismaService.employee.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { workConfigId: 1 },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 1,
        action: 'ASIGNAR_CONFIGURACION',
        entity: 'Empleado',
        entityId: 10,
        newValues: { workConfigId: 1 },
      });
      expect(result).toEqual(updatedEmployee);
    });

    it('debería lanzar NotFoundException si el empleado no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.employee.findUnique.mockResolvedValue(null);

      await expect(service.assignToEmployee(1, 999, 1)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.assignToEmployee(1, 999, 1)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'EMPLEADO_NO_ENCONTRADO',
        }),
      });
    });

    it('debería lanzar NotFoundException si la configuración no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(null);

      await expect(service.assignToEmployee(999, 10, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── upsertDistribution ──────────────────────────────────────────

  describe('upsertDistribution', () => {
    const dto: CreateOrdinaryDistributionDto = {
      dayOfWeek: 1,
      ordinaryMinutesCap: 480,
    };

    it('debería crear una distribución nueva', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      const newDist = { id: 3, workConfigId: 1, ...dto };
      mockPrismaService.ordinaryDistribution.upsert.mockResolvedValue(newDist);

      const result = await service.upsertDistribution(1, dto, 1);

      expect(mockPrismaService.ordinaryDistribution.upsert).toHaveBeenCalledWith({
        where: {
          workConfigId_dayOfWeek: { workConfigId: 1, dayOfWeek: dto.dayOfWeek },
        },
        update: { ordinaryMinutesCap: dto.ordinaryMinutesCap },
        create: {
          workConfigId: 1,
          dayOfWeek: dto.dayOfWeek,
          ordinaryMinutesCap: dto.ordinaryMinutesCap,
        },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 1,
        action: 'ACTUALIZAR_DISTRIBUCION',
        entity: 'DistribucionOrdinaria',
        entityId: newDist.id,
        newValues: dto,
      });
      expect(result).toEqual(newDist);
    });

    it('debería actualizar una distribución existente', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      const updatedDist = { id: 1, workConfigId: 1, dayOfWeek: 1, ordinaryMinutesCap: 600 };
      mockPrismaService.ordinaryDistribution.upsert.mockResolvedValue(updatedDist);

      const result = await service.upsertDistribution(1, dto, 1);

      expect(result.ordinaryMinutesCap).toBe(600);
    });

    it('debería lanzar NotFoundException si la configuración no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertDistribution(999, dto, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findDistributions ───────────────────────────────────────────

  describe('findDistributions', () => {
    it('debería retornar las distribuciones de una configuración', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.ordinaryDistribution.findMany.mockResolvedValue(
        mockDistributions,
      );

      const result = await service.findDistributions(1);

      expect(mockPrismaService.ordinaryDistribution.findMany).toHaveBeenCalledWith({
        where: { workConfigId: 1 },
        orderBy: { dayOfWeek: 'asc' },
      });
      expect(result).toEqual(mockDistributions);
      expect(result).toHaveLength(2);
    });

    it('debería retornar array vacío si no hay distribuciones', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.ordinaryDistribution.findMany.mockResolvedValue([]);

      const result = await service.findDistributions(1);

      expect(result).toEqual([]);
    });

    it('debería lanzar NotFoundException si la configuración no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(null);

      await expect(service.findDistributions(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── removeDistribution ──────────────────────────────────────────

  describe('removeDistribution', () => {
    it('debería eliminar una distribución exitosamente', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      const dist = { id: 1, workConfigId: 1, dayOfWeek: 1, ordinaryMinutesCap: 480 };
      mockPrismaService.ordinaryDistribution.findUnique.mockResolvedValue(dist);
      mockPrismaService.ordinaryDistribution.delete.mockResolvedValue(dist);

      await service.removeDistribution(1, 1, 1);

      expect(
        mockPrismaService.ordinaryDistribution.findUnique,
      ).toHaveBeenCalledWith({
        where: { workConfigId_dayOfWeek: { workConfigId: 1, dayOfWeek: 1 } },
      });
      expect(mockPrismaService.ordinaryDistribution.delete).toHaveBeenCalledWith({
        where: { workConfigId_dayOfWeek: { workConfigId: 1, dayOfWeek: 1 } },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith({
        userId: 1,
        action: 'ELIMINAR_DISTRIBUCION',
        entity: 'DistribucionOrdinaria',
        entityId: dist.id,
        newValues: { dayOfWeek: 1 },
      });
    });

    it('debería lanzar NotFoundException si la distribución no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(mockWorkConfig);
      mockPrismaService.ordinaryDistribution.findUnique.mockResolvedValue(null);

      await expect(service.removeDistribution(1, 99, 1)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        service.removeDistribution(1, 99, 1),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DISTRIBUCION_NO_ENCONTRADA',
        }),
      });
    });

    it('debería lanzar NotFoundException si la configuración no existe', async () => {
      mockPrismaService.workConfig.findUnique.mockResolvedValue(null);

      await expect(service.removeDistribution(999, 1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
