import { Test, TestingModule } from '@nestjs/testing';
import { AuditEngineService } from './audit-engine.service';
import { EngineInput } from '../labor-engine/labor-engine.types';

describe('AuditEngineService', () => {
  let service: AuditEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditEngineService],
    }).compile();
    service = module.get<AuditEngineService>(AuditEngineService);
  });

  function makeDate(bogotaIso: string): Date {
    const d = new Date(bogotaIso + 'Z');
    return new Date(d.getTime() + 5 * 60 * 60 * 1000);
  }

  function localDate(iso: string): Date {
    const d = new Date(iso + 'T00:00:00Z');
    return new Date(d.getTime() + 5 * 60 * 60 * 1000);
  }

  function adminDists(workDays: number[], capPerDay: number) {
    return Array.from({ length: 7 }, (_, dow) => ({
      dayOfWeek: dow,
      ordinaryMinutesCap: workDays.includes(dow) ? capPerDay : 0,
    }));
  }

  function makeInput(overrides: Partial<EngineInput> = {}): EngineInput {
    return {
      startTime: makeDate('2026-07-13T07:00:00'),
      endTime: makeDate('2026-07-13T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 360),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
      ...overrides,
    };
  }

  it('should return a complete AuditTrace for a regular workday', () => {
    const trace = service.trace(makeInput(), {
      id: 1,
      name: 'Juan Pérez',
      documentNumber: '123456',
      modality: 'ADMINISTRATIVO',
      configName: 'Estándar',
    });

    expect(trace.generalInfo).toBeDefined();
    expect(trace.generalInfo.employeeName).toBe('Juan Pérez');
    expect(trace.generalInfo.documentNumber).toBe('123456');
    expect(trace.inputData).toBeDefined();
    expect(trace.configUsed).toBeDefined();
    expect(trace.breakApplication).toBeDefined();
    expect(trace.timeline.length).toBeGreaterThan(0);
    expect(trace.legalClassification).toBeDefined();
    expect(trace.weeklyAccumulation).toBeDefined();
    expect(trace.finalResult).toBeDefined();
    expect(trace.validations.length).toBeGreaterThan(0);
    expect(trace.generatedAt).toBeDefined();
  });

  it('should produce same total as labor engine classify', () => {
    const input = makeInput();
    const trace = service.trace(input, {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });

    expect(trace.finalResult.totalMinutes).toBe(600);
    expect(trace.finalResult.breakMinutes).toBe(60);
    expect(trace.finalResult.liquidableMinutes).toBe(540);
  });

  it('should classify Monday 07:00-17:00 correctly with break first (cap=360)', () => {
    const input = makeInput({
      startTime: makeDate('2026-07-13T07:00:00'),
      endTime: makeDate('2026-07-13T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 360),
    });
    const trace = service.trace(input, {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });

    const result = trace.finalResult;
    expect(result.ordinarioDiurno).toBe(360);
    expect(result.extraDiurno).toBe(180);
    expect(result.ordinarioNocturno).toBe(0);
    expect(result.extraNocturno).toBe(0);
    expect(result.dominicalDiurno).toBe(0);

    expect(trace.legalClassification.invariants.equalsLiquidable).toBe(true);
  });

  it('should classify Friday 07:00-17:00 with cap=480 (user specific case)', () => {
    const input = makeInput({
      startTime: makeDate('2026-07-17T07:00:00'),
      endTime: makeDate('2026-07-17T17:00:00'),
      ordinaryDistributions: adminDists([5], 480),
    });
    const trace = service.trace(input, {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });

    const result = trace.finalResult;
    expect(result.ordinarioDiurno).toBe(480);
    expect(result.extraDiurno).toBe(60);
    expect(result.ordinarioNocturno).toBe(0);

    expect(trace.legalClassification.invariants.equalsLiquidable).toBe(true);
  });

  it('should trace night work correctly (19:00-06:00)', () => {
    const input = makeInput({
      startTime: makeDate('2026-07-13T19:00:00'),
      endTime: makeDate('2026-07-14T06:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 360),
      accumulatedWeekMinutes: 0,
    });
    const trace = service.trace(input, {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });

    expect(trace.finalResult.ordinarioNocturno).toBe(600);
    expect(trace.timeline.length).toBe(600);
    expect(trace.timeline[0].isNight).toBe(true);
  });

  it('should trace Sunday work correctly', () => {
    const input = makeInput({
      startTime: makeDate('2026-07-12T07:00:00'),
      endTime: makeDate('2026-07-12T17:00:00'),
      ordinaryDistributions: Array.from({ length: 7 }, (_, dow) => ({
        dayOfWeek: dow,
        ordinaryMinutesCap: dow === 0 ? 480 : 360,
      })),
    });
    const trace = service.trace(input, {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });

    expect(trace.finalResult.dominicalDiurno).toBe(480);
    expect(trace.finalResult.extraDominicalFestivoDiurno).toBe(60);
    expect(trace.timeline[0].isSunday).toBe(true);
    expect(trace.timeline[0].isRestDay).toBe(true);
  });

  it('should trace holiday work correctly', () => {
    const input = makeInput({
      startTime: makeDate('2026-07-20T07:00:00'),
      endTime: makeDate('2026-07-20T15:00:00'),
      holidays: [localDate('2026-07-20')],
    });
    const trace = service.trace(input, {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });

    expect(trace.finalResult.festivoDiurno).toBe(360);
    expect(trace.finalResult.extraDominicalFestivoDiurno).toBe(60);
    expect(trace.timeline[0].isHoliday).toBe(true);
    expect(trace.timeline[0].isRestDay).toBe(true);
  });

  it('should have all validations passing for a normal workday', () => {
    const trace = service.trace(makeInput(), {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });

    const failed = trace.validations.filter((v) => !v.passed);
    expect(failed.length).toBe(0);
  });

  it('should handle zero-duration input', () => {
    const input = makeInput({
      startTime: makeDate('2026-07-13T07:00:00'),
      endTime: makeDate('2026-07-13T07:00:00'),
    });
    const trace = service.trace(input);
    expect(trace.timeline.length).toBe(0);
    expect(trace.validations.length).toBeGreaterThan(0);
  });

  it('should handle negative-duration input', () => {
    const input = makeInput({
      startTime: makeDate('2026-07-13T17:00:00'),
      endTime: makeDate('2026-07-13T07:00:00'),
    });
    const trace = service.trace(input);
    expect(trace.timeline.length).toBe(0);
    expect(trace.breakApplication.effectiveMinutes).toBe(0);
  });

  it('should record break application reasoning', () => {
    const trace = service.trace(
      makeInput({
        startTime: makeDate('2026-07-13T07:00:00'),
        endTime: makeDate('2026-07-13T17:00:00'),
        breakMinutes: 60,
      }),
    );
    expect(trace.breakApplication.breakMinutes).toBe(60);
    expect(trace.breakApplication.effectiveMinutes).toBe(540);
    expect(trace.breakApplication.reasoning).toContain('60');
  });

  it('should cap break at total minutes', () => {
    const trace = service.trace(
      makeInput({
        startTime: makeDate('2026-07-13T07:00:00'),
        endTime: makeDate('2026-07-13T07:30:00'),
        breakMinutes: 60,
      }),
    );
    expect(trace.breakApplication.breakMinutes).toBe(30);
    expect(trace.breakApplication.effectiveMinutes).toBe(0);
  });

  it('should track weekly accumulation', () => {
    const trace = service.trace(
      makeInput({
        startTime: makeDate('2026-07-13T07:00:00'),
        endTime: makeDate('2026-07-13T17:00:00'),
        accumulatedWeekMinutes: 1800,
        weeklyTargetMinutes: 2520,
        ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 360),
      }),
    );
    expect(trace.weeklyAccumulation.beforeMinutes).toBe(1800);
    expect(trace.weeklyAccumulation.afterMinutes).toBe(1800 + 360);
    expect(trace.weeklyAccumulation.targetMinutes).toBe(2520);
    expect(trace.weeklyAccumulation.remainingMinutes).toBe(2520 - 1800 - 360);
  });

  it('should include legal bases for each bucket', () => {
    const trace = service.trace(makeInput());
    for (const bucket of trace.legalClassification.buckets) {
      expect(bucket.legalBase).toBeTruthy();
      expect(bucket.description).toBeTruthy();
      expect(typeof bucket.percentage).toBe('number');
    }
  });

  it('should include territory config in generalInfo', () => {
    const trace = service.trace(makeInput(), {
      id: 1,
      name: 'Test',
      documentNumber: '000',
      modality: 'ADMINISTRATIVO',
      configName: 'Test',
    });
    expect(trace.generalInfo.territoryConfig).toBeDefined();
  });

  it('should work without employeeInfo', () => {
    const trace = service.trace(makeInput());
    expect(trace.generalInfo.employeeName).toBe('Desconocido');
    expect(trace.generalInfo.employeeId).toBe(0);
  });
});
