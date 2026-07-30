import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrisma = {
    employee: {
      findMany: jest.fn(),
    },
    workSession: {
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('getWeeklySummary', () => {
    it('debe retornar resumen semanal con datos', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 1,
          firstName: 'Carlos',
          lastName: 'Pérez',
          documentNumber: '123',
          area: 'IT',
        },
      ]);
      mockPrisma.workSession.groupBy.mockResolvedValue([
        {
          employeeId: 1,
          _sum: {
            totalMinutes: 1200,
            ordinaryMinutes: 1000,
            nightSurchargeMinutes: 100,
            extraDayMinutes: 100,
            extraNightMinutes: 0,
            sundayMinutes: 0,
            holidayMinutes: 0,
            extraHolidayDayMinutes: 0,
            extraHolidayNightMinutes: 0,
            sundayNightSurchargeMinutes: 0,
          },
          _count: { id: 5 },
        },
      ]);

      const result = await service.getWeeklySummary({ year: 2026, week: 28 });

      expect(result.periodo).toContain('Semana 28');
      expect(result.totalHoras).toBe(18.33);
      expect(result.totalJornadas).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].employee.firstName).toBe('Carlos');
      expect(result.data[0].ordinaryMinutes).toBe(1000);
    });

    it('debe retornar vacío si no hay empleados', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getWeeklySummary({ year: 2026, week: 28 });

      expect(result.data).toHaveLength(0);
      expect(result.totalHoras).toBe(0);
      expect(result.totalJornadas).toBe(0);
    });
  });

  describe('getMonthlySummary', () => {
    it('debe retornar resumen mensual', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 1,
          firstName: 'Ana',
          lastName: 'García',
          documentNumber: '456',
          area: 'RRHH',
        },
      ]);
      mockPrisma.workSession.groupBy.mockResolvedValue([
        {
          employeeId: 1,
          _sum: {
            totalMinutes: 4800,
            ordinaryMinutes: 4000,
            nightSurchargeMinutes: 400,
            extraDayMinutes: 400,
            extraNightMinutes: 0,
            sundayMinutes: 0,
            holidayMinutes: 0,
            extraHolidayDayMinutes: 0,
            extraHolidayNightMinutes: 0,
            sundayNightSurchargeMinutes: 0,
          },
          _count: { id: 20 },
        },
      ]);

      const result = await service.getMonthlySummary({ year: 2026, month: 7 });

      expect(result.periodo).toBe('Jul 2026');
      expect(result.totalHoras).toBe(73.33);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getRangeSummary', () => {
    it('debe retornar resumen por rango', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 1,
          firstName: 'Luis',
          lastName: 'López',
          documentNumber: '789',
          area: 'IT',
        },
      ]);
      mockPrisma.workSession.groupBy.mockResolvedValue([
        {
          employeeId: 1,
          _sum: {
            totalMinutes: 600,
            ordinaryMinutes: 600,
            nightSurchargeMinutes: 0,
            extraDayMinutes: 0,
            extraNightMinutes: 0,
            sundayMinutes: 0,
            holidayMinutes: 0,
            extraHolidayDayMinutes: 0,
            extraHolidayNightMinutes: 0,
            sundayNightSurchargeMinutes: 0,
          },
          _count: { id: 1 },
        },
      ]);

      const result = await service.getRangeSummary({
        startDate: '2026-07-01',
        endDate: '2026-07-08',
      });

      expect(result.data).toHaveLength(1);
      expect(result.periodo).toContain('2026-07-01');
      expect(result.totalHoras).toBe(10);
    });

    it('debe rechazar rango inválido', async () => {
      await expect(
        service.getRangeSummary({
          startDate: '2026-07-31',
          endDate: '2026-07-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
