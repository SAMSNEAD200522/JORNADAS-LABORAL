/**
 * Tests del Motor de Liquidacion de Jornadas Laborales
 *
 * FASE 1: El descanso se descuenta ANTES de clasificar.
 * Los minutos efectivos = presencia - descanso.
 * Solo se clasifican los minutos efectivos.
 *
 * makeDate() crea fechas UTC+5h para que el motor (que convierte a Bogota)
 * interprete correctamente las horas independientemente del timezone de la maquina.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { LaborEngineService } from './labor-engine.service';

describe('LaborEngineService', () => {
  let engine: LaborEngineService;

  const noHolidays: Date[] = [];

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

  function territoryDists(capPerDay: number) {
    return Array.from({ length: 7 }, (_, dow) => ({
      dayOfWeek: dow,
      ordinaryMinutesCap: capPerDay,
    }));
  }

  function verifyIntegrity(result: any, label: string) {
    const classified =
      result.ordinarioDiurno +
      result.ordinarioNocturno +
      result.extraDiurno +
      result.extraNocturno +
      result.dominicalDiurno +
      result.festivoDiurno +
      result.dominicalNocturno +
      result.festivoNocturno +
      result.extraDominicalFestivoDiurno +
      result.extraDominicalFestivoNocturno;
    expect(classified).toBe(result.liquidableMinutes);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LaborEngineService],
    }).compile();
    engine = module.get<LaborEngineService>(LaborEngineService);
  });

  it('1. ADMIN - jornada normal Lun 07:00-17:00 cap=540', () => {
    // 600 min presencia, break=60 -> 540 efectivos, cap=540
    // 540 efectivos dentro del cap -> todo ordinario
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(600);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(540);
    expect(result.ordinarioDiurno).toBe(540);
    expect(result.extraDiurno).toBe(0);
    verifyIntegrity(result, 'Lun normal');
  });

  it('2. TERR - jornada nocturna 20:00-05:00 cap=420', () => {
    // 540 presencia, break=60 -> 480 efectivos, cap=420
    // 480 nocturno: 240(Mie20-24)+240(Jue00-04), daily reset, todo dentro cap
    const result = engine.classify({
      startTime: makeDate('2026-07-08T20:00:00'),
      endTime: makeDate('2026-07-09T05:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(540);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(480);
    expect(result.ordinarioNocturno).toBe(480);
    expect(result.extraNocturno).toBe(0);
    verifyIntegrity(result, 'Nocturno terr');
  });

  it('3. TERR - cruce medianoche Mie 22:00 a Jue 06:00 cap=420', () => {
    // 480 presencia, break=60 -> 420 efectivos, cap=420
    // 120(Mie22-24)+300(Jue00-04)=420, todo dentro cap
    const result = engine.classify({
      startTime: makeDate('2026-07-08T22:00:00'),
      endTime: makeDate('2026-07-09T06:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(480);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(420);
    expect(result.ordinarioNocturno).toBe(420);
    verifyIntegrity(result, 'Cruce medianoche');
  });

  it('4. TERR - domingo diurno dentro cap', () => {
    // 360 presencia, break=60 -> 300 efectivos, cap=420
    // Todo domingo, dentro cap
    const result = engine.classify({
      startTime: makeDate('2026-07-12T08:00:00'),
      endTime: makeDate('2026-07-12T14:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(360);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(300);
    expect(result.dominicalDiurno).toBe(300);
    verifyIntegrity(result, 'Domingo terr');
  });

  it('5. TERR - domingo supera cap diario', () => {
    // 600 presencia, break=60 -> 540 efectivos, cap=420
    // 420 domDiurno + 120 extraDomDiurno
    const result = engine.classify({
      startTime: makeDate('2026-07-12T08:00:00'),
      endTime: makeDate('2026-07-12T18:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(600);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(540);
    expect(result.dominicalDiurno).toBe(420);
    expect(result.extraDominicalFestivoDiurno).toBe(120);
    verifyIntegrity(result, 'Domingo supera cap');
  });

  it('6. TERR - festivo diurno dentro cap', () => {
    // 360 presencia, break=60 -> 300 efectivos, cap=420
    const result = engine.classify({
      startTime: makeDate('2026-07-20T08:00:00'),
      endTime: makeDate('2026-07-20T14:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-20')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(360);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(300);
    expect(result.festivoDiurno).toBe(300);
    verifyIntegrity(result, 'Festivo terr');
  });

  it('7. TERR - domingo nocturno con cruce a lunes', () => {
    // 360 presencia, break=60 -> 300 efectivos, cap=420
    // Sun 20-24 (240 noct): domNocturno
    // Mon 00-01 (60 noct): ordNocturno
    const result = engine.classify({
      startTime: makeDate('2026-07-12T20:00:00'),
      endTime: makeDate('2026-07-13T02:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(360);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(300);
    expect(result.dominicalNocturno).toBe(240);
    expect(result.ordinarioNocturno).toBe(60);
    verifyIntegrity(result, 'Domingo nocturno');
  });

  it('8. ADMIN - extra diurna Lun 07:00-19:00 cap=540', () => {
    // 720 presencia, break=60 -> 660 efectivos, cap=540
    // 540 ordDiurno + 120 extraDiurno
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T19:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(720);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(660);
    expect(result.ordinarioDiurno).toBe(540);
    expect(result.extraDiurno).toBe(120);
    verifyIntegrity(result, 'Extra diurna admin');
  });

  it('9. TERR - transicion diurno-nocturno Mar 18:00-22:00 cap=420', () => {
    // 240 presencia, break=60 -> 180 efectivos, cap=420
    // 18-19 (60 dia) + 19-21 (120 noct) = 180, todo dentro cap
    const result = engine.classify({
      startTime: makeDate('2026-07-07T18:00:00'),
      endTime: makeDate('2026-07-07T22:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(240);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(180);
    expect(result.ordinarioDiurno).toBe(60);
    expect(result.ordinarioNocturno).toBe(120);
    verifyIntegrity(result, 'Transicion terr');
  });

  it('10. ADMIN - extra nocturna Lun 07:00-22:00 cap=540', () => {
    // 900 presencia, break=60 -> 840 efectivos, cap=540
    // 07-16 (540 dia) ordDiurno + 16-19 (180 dia) extraDiurno + 19-21 (120 noct) extraNocturno
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T22:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(900);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(840);
    expect(result.ordinarioDiurno).toBe(540);
    expect(result.extraDiurno).toBe(180);
    expect(result.extraNocturno).toBe(120);
    verifyIntegrity(result, 'Extra nocturna admin');
  });

  it('11. TERR - cruce semana Vie 20:00 a Sab 06:00 cap=420', () => {
    // 600 presencia, break=60 -> 540 efectivos, cap=420
    // Todo nocturno: 240(Vie20-24)+300(Sab00-05)=540, daily reset, todo dentro cap
    const result = engine.classify({
      startTime: makeDate('2026-07-10T20:00:00'),
      endTime: makeDate('2026-07-11T06:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(600);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(540);
    expect(result.ordinarioNocturno).toBe(540);
    expect(result.extraNocturno).toBe(0);
    verifyIntegrity(result, 'Cruce semana');
  });

  it('12. ADMIN - acumulado semanal acota extra', () => {
    // accumulated=2400, target=2520 -> solo 120 ord restantes
    // 600 presencia, break=60 -> 540 efectivos, cap=540
    // 120 ordDiurno + 420 extraDiurno
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 2400,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(600);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(540);
    expect(result.ordinarioDiurno).toBe(120);
    expect(result.extraDiurno).toBe(420);
    verifyIntegrity(result, 'Acumulado semanal');
  });

  it('13. Sesion de 30 min - break limitado a presencia', () => {
    // 30 presencia, break=min(60,30)=30 -> 0 efectivos
    const result = engine.classify({
      startTime: makeDate('2026-07-06T10:00:00'),
      endTime: makeDate('2026-07-06T10:30:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(30);
    expect(result.breakMinutes).toBe(30);
    expect(result.ordinarioDiurno).toBe(0);
    expect(result.liquidableMinutes).toBe(0);
    verifyIntegrity(result, 'Sesion corta');
  });

  it('14. Sesion de 45 min - break limitado a presencia', () => {
    // 45 presencia, break=min(60,45)=45 -> 0 efectivos
    const result = engine.classify({
      startTime: makeDate('2026-07-06T10:00:00'),
      endTime: makeDate('2026-07-06T10:45:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(45);
    expect(result.breakMinutes).toBe(45);
    expect(result.ordinarioDiurno).toBe(0);
    expect(result.liquidableMinutes).toBe(0);
    verifyIntegrity(result, 'Sesion 45 min');
  });

  it('15. TERR - domingo con acumulado casi al limite', () => {
    // accumulated=2400, target=2520 -> 120 ord restantes
    // 360 presencia, break=60 -> 300 efectivos, cap=420
    // 120 domDiurno(weekly OK) + 180 extraDomDiurno(weekly exceeded)
    const result = engine.classify({
      startTime: makeDate('2026-07-12T08:00:00'),
      endTime: makeDate('2026-07-12T14:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 2400,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(360);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(300);
    expect(result.dominicalDiurno).toBe(120);
    expect(result.extraDominicalFestivoDiurno).toBe(180);
    verifyIntegrity(result, 'Domingo limite');
  });

  it('16. ADMIN - distribucion variable Lun 07:00-17:00 cap=540', () => {
    const dists = [
      { dayOfWeek: 1, ordinaryMinutesCap: 540 },
      { dayOfWeek: 2, ordinaryMinutesCap: 540 },
      { dayOfWeek: 3, ordinaryMinutesCap: 480 },
      { dayOfWeek: 4, ordinaryMinutesCap: 480 },
      { dayOfWeek: 5, ordinaryMinutesCap: 480 },
      { dayOfWeek: 6, ordinaryMinutesCap: 0 },
      { dayOfWeek: 0, ordinaryMinutesCap: 0 },
    ];

    // 600 presencia, break=60 -> 540 efectivos, cap Mon=540
    // 540 dentro cap -> todo ordinario
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T17:00:00'),
      ordinaryDistributions: dists,
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(600);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(540);
    expect(result.ordinarioDiurno).toBe(540);
    expect(result.extraDiurno).toBe(0);
    verifyIntegrity(result, 'Dist variable');
  });

  it('17. TERR - domingo completo 00:00-23:59', () => {
    // 1439 presencia, break=60 -> 1379 efectivos, cap=420
    // 00-06 (360 noct): domFestNoct
    // 06-07 (60 dia): domFestDiurno, dailyUsed=420=cap
    // 07-19 (720 dia): extraDomFestDiurno
    // 19-22:59 (239 noct): extraDomFestNoct
    const result = engine.classify({
      startTime: makeDate('2026-07-12T00:00:00'),
      endTime: makeDate('2026-07-12T23:59:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(1439);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(1379);
    expect(result.dominicalNocturno).toBe(360);
    expect(result.dominicalDiurno).toBe(60);
    expect(result.extraDominicalFestivoDiurno).toBe(720);
    expect(result.extraDominicalFestivoNocturno).toBe(239);
    verifyIntegrity(result, 'Domingo completo');
  });

  it('18. TERR - sabado 08:00-17:00 cap=420', () => {
    // 540 presencia, break=60 -> 480 efectivos, cap=420
    // 420 ordDiurno + 60 extraDiurno
    const result = engine.classify({
      startTime: makeDate('2026-07-11T08:00:00'),
      endTime: makeDate('2026-07-11T17:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(540);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(480);
    expect(result.ordinarioDiurno).toBe(420);
    expect(result.extraDiurno).toBe(60);
    verifyIntegrity(result, 'Sabado terr');
  });

  it('19. Sesion de 0 minutos', () => {
    const result = engine.classify({
      startTime: makeDate('2026-07-06T10:00:00'),
      endTime: makeDate('2026-07-06T10:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(0);
    expect(result.liquidableMinutes).toBe(0);
    verifyIntegrity(result, 'Cero minutos');
  });

  it('20. TERR - cruce mes Lun 30 Jun a Mar 01 Jul cap=420', () => {
    // 540 presencia, break=60 -> 480 efectivos, cap=420
    // Todo nocturno: 240(Jun30 20-24)+240(Jul01 00-04)=480
    const result = engine.classify({
      startTime: makeDate('2026-06-30T20:00:00'),
      endTime: makeDate('2026-07-01T05:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(540);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(480);
    expect(result.ordinarioNocturno).toBe(480);
    expect(result.extraNocturno).toBe(0);
    verifyIntegrity(result, 'Cruce mes');
  });

  it('21. ADMIN - festivo diurno (no domingo) Lun 07-17 con festivo cap=540', () => {
    // 600 presencia, break=60 -> 540 efectivos, cap=540
    // Todo festivo, dentro cap -> domFestDiurno
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [localDate('2026-07-06')],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(600);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(540);
    expect(result.festivoDiurno).toBe(540);
    expect(result.extraDominicalFestivoDiurno).toBe(0);
    expect(result.ordinarioDiurno).toBe(0);
    verifyIntegrity(result, 'Festivo admin');
  });

  it('22. Break descontado de ordinarioNocturno cuando no hay ordinarioDiurno', () => {
    // 21:00-06:00 = 540 presencia, break=60 -> 480 efectivos, cap=540
    // Todo nocturno: 180(Mon21-24)+300(Tue00-05)=480, dentro cap
    const result = engine.classify({
      startTime: makeDate('2026-07-06T21:00:00'),
      endTime: makeDate('2026-07-07T06:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(540);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(480);
    expect(result.ordinarioNocturno).toBe(480);
    expect(result.ordinarioDiurno).toBe(0);
    verifyIntegrity(result, 'Break nocturno');
  });

  it('23. TERR - festivo nocturno cruce medianoche', () => {
    // 480 presencia, break=60 -> 420 efectivos, cap=420
    // Jul20 22-24 (120 noct, holiday): domFestNoct
    // Jul21 00-05 (300 noct, not holiday): ordNoct
    const result = engine.classify({
      startTime: makeDate('2026-07-20T22:00:00'),
      endTime: makeDate('2026-07-21T06:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-20')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(480);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(420);
    expect(result.festivoNocturno).toBe(120);
    expect(result.ordinarioNocturno).toBe(300);
    verifyIntegrity(result, 'Festivo cruce');
  });

  it('24. breakMinutes = 0 (sin descanso)', () => {
    // 480 presencia, break=0 -> 480 efectivos, cap=540
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T15:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 0,
    });

    expect(result.totalMinutes).toBe(480);
    expect(result.breakMinutes).toBe(0);
    expect(result.ordinarioDiurno).toBe(480);
    expect(result.liquidableMinutes).toBe(480);
    verifyIntegrity(result, 'Sin break');
  });

  it('25. Weekly exactamente al limite (2520)', () => {
    // accumulated=2520, target=2520 -> 0 ord restantes
    // 480 presencia, break=60 -> 420 efectivos, cap=540
    // Todo extra (weekly agotado)
    const result = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T15:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 2520,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(480);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(420);
    expect(result.extraDiurno).toBe(420);
    expect(result.ordinarioDiurno).toBe(0);
    verifyIntegrity(result, 'Weekly limit exact');
  });

  it('26. TERR - lunes cap=0 (todo extra)', () => {
    const dists = Array.from({ length: 7 }, (_, dow) => ({
      dayOfWeek: dow,
      ordinaryMinutesCap: dow === 1 ? 0 : 420,
    }));
    // 480 presencia, break=60 -> 420 efectivos, cap=0 Mon
    // Todo extra
    const result = engine.classify({
      startTime: makeDate('2026-07-06T08:00:00'),
      endTime: makeDate('2026-07-06T16:00:00'),
      ordinaryDistributions: dists,
      holidays: noHolidays,
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(480);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(420);
    expect(result.extraDiurno).toBe(420);
    expect(result.ordinarioDiurno).toBe(0);
    verifyIntegrity(result, 'Cap cero');
  });

  it('27. ADMIN - sesion nocturna 19:00-01:00 cruce', () => {
    // 360 presencia, break=60 -> 300 efectivos, cap=540
    // Mon 19-24 (300 noct): ordNocturno, dentro cap
    const result = engine.classify({
      startTime: makeDate('2026-07-06T19:00:00'),
      endTime: makeDate('2026-07-07T01:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(360);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(300);
    expect(result.ordinarioNocturno).toBe(300);
    expect(result.ordinarioDiurno).toBe(0);
    verifyIntegrity(result, 'Admin noche cruce');
  });

  it('28. CASO USUARIO - Viernes 07:00-17:00 cap=480 (descanso antes del limite)', () => {
    // 600 presencia, break=60 -> 540 efectivos, cap=480
    // 480 ordDiurno (dentro cap) + 60 extraDiurno (fuera cap)
    // El descanso NO convierte ordinario en extra
    const result = engine.classify({
      startTime: makeDate('2026-07-10T07:00:00'),
      endTime: makeDate('2026-07-10T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 480),
      holidays: noHolidays,
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });

    expect(result.totalMinutes).toBe(600);
    expect(result.breakMinutes).toBe(60);
    expect(result.liquidableMinutes).toBe(540);
    expect(result.ordinarioDiurno).toBe(480);
    expect(result.extraDiurno).toBe(60);
    verifyIntegrity(result, 'Caso usuario viernes');
  });
});
