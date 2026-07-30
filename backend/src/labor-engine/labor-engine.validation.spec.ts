/**
 * PRE-RELEASE VALIDATION: Labor Engine Calculation Verification
 *
 * Every scenario is hand-calculated and compared against engine output.
 * If ANY scenario fails, the engine is NOT production-ready.
 *
 * Dates: July 2026 (Ley 2466 vigente: 42h semanales, 8h diarias)
 *
 * Key rules:
 * - Night: 19:00-06:00 (NIGHT_START=1140, NIGHT_END=360)
 * - Daily ordinary cap: per distribution (typically 480 for admin, 420 territory)
 * - Weekly target: 2520 min (42h)
 * - Break: 60 min, discounted BEFORE classification
 * - Sunday: isRestDay, NOT ordinary unless daily+weekly caps allow
 * - Holiday: isRestDay, NOT ordinary unless daily+weekly caps allow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { LaborEngineService } from './labor-engine.service';

describe('PRE-RELEASE VALIDATION: Engine Calculations', () => {
  let engine: LaborEngineService;

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

  function sumBuckets(r: any): number {
    return (
      r.ordinarioDiurno +
      r.ordinarioNocturno +
      r.extraDiurno +
      r.extraNocturno +
      r.dominicalDiurno +
      r.festivoDiurno +
      r.dominicalNocturno +
      r.festivoNocturno +
      r.extraDominicalFestivoDiurno +
      r.extraDominicalFestivoNocturno
    );
  }

  function invariant(result: any, label: string) {
    const sum = sumBuckets(result);
    expect(sum).toBe(result.liquidableMinutes);
    expect(result.totalMinutes - result.breakMinutes).toBe(
      result.liquidableMinutes,
    );
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LaborEngineService],
    }).compile();
    engine = module.get<LaborEngineService>(LaborEngineService);
  });

  // ─── V1: ORDINARY DAY SHIFT ─────────────────────────────
  it('V1: Mon 07:00-17:00 ADMIN cap=540 break=60 → 540 ordDiurno', () => {
    // 600 min presence, break=60, effective=540
    // 07:00-17:00 is all daytime (420-1020 minOfDay, all < 1140)
    // dailyUsed: 0→540, all within cap=540
    const r = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.totalMinutes).toBe(600);
    expect(r.breakMinutes).toBe(60);
    expect(r.liquidableMinutes).toBe(540);
    expect(r.ordinarioDiurno).toBe(540);
    expect(r.ordinarioNocturno).toBe(0);
    expect(r.extraDiurno).toBe(0);
    expect(r.extraNocturno).toBe(0);
    expect(r.dominicalDiurno).toBe(0);
    expect(r.festivoDiurno).toBe(0);
    expect(r.dominicalNocturno).toBe(0);
    expect(r.festivoNocturno).toBe(0);
    expect(r.extraDominicalFestivoDiurno).toBe(0);
    expect(r.extraDominicalFestivoNocturno).toBe(0);
    invariant(r, 'V1');
  });

  // ─── V2: NIGHT SHIFT ────────────────────────────────────
  it('V2: Wed 20:00-Thu 05:00 TERR cap=420 break=60 → 480 ordNocturno', () => {
    // 540 presence, break=60, effective=480
    // All minutes are night (20:00=1200, 05:00=300)
    // Wed dailyUsed: 0→240 (20:00-24:00), cap=420, within cap
    // Thu dailyUsed resets: 0→240 (00:00-04:00), cap=420, within cap
    const r = engine.classify({
      startTime: makeDate('2026-07-08T20:00:00'),
      endTime: makeDate('2026-07-09T05:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.totalMinutes).toBe(540);
    expect(r.breakMinutes).toBe(60);
    expect(r.liquidableMinutes).toBe(480);
    expect(r.ordinarioNocturno).toBe(480);
    expect(r.ordinarioDiurno).toBe(0);
    expect(r.extraDiurno).toBe(0);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V2');
  });

  // ─── V3: CROSS-MIDNIGHT ─────────────────────────────────
  it('V3: Wed 22:00-Thu 06:00 TERR cap=420 break=60 → 420 ordNocturno', () => {
    // 480 presence, break=60, effective=420
    // All night, within daily cap on both days
    const r = engine.classify({
      startTime: makeDate('2026-07-08T22:00:00'),
      endTime: makeDate('2026-07-09T06:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.totalMinutes).toBe(480);
    expect(r.liquidableMinutes).toBe(420);
    expect(r.ordinarioNocturno).toBe(420);
    invariant(r, 'V3');
  });

  // ─── V4: SUNDAY DAYTIME ─────────────────────────────────
  it('V4: Sun 08:00-14:00 TERR cap=420 break=60 → 300 dominicalDiurno', () => {
    // 360 presence, effective=300
    // Sunday: isRestDay=true, isHoliday=false
    // Daytime (08:00-14:00), all within daily cap=420
    const r = engine.classify({
      startTime: makeDate('2026-07-12T08:00:00'),
      endTime: makeDate('2026-07-12T14:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(300);
    expect(r.dominicalDiurno).toBe(300);
    expect(r.festivoDiurno).toBe(0);
    expect(r.extraDominicalFestivoDiurno).toBe(0);
    invariant(r, 'V4');
  });

  // ─── V5: SUNDAY EXCEEDS CAP ─────────────────────────────
  it('V5: Sun 08:00-18:00 TERR cap=420 break=60 → 420 domDiurno + 120 extraDomDiurno', () => {
    // 600 presence, effective=540
    // First 420 min: within cap → dominicalDiurno
    // Next 120 min: cap exceeded → extraDominicalFestivoDiurno
    const r = engine.classify({
      startTime: makeDate('2026-07-12T08:00:00'),
      endTime: makeDate('2026-07-12T18:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(540);
    expect(r.dominicalDiurno).toBe(420);
    expect(r.extraDominicalFestivoDiurno).toBe(120);
    invariant(r, 'V5');
  });

  // ─── V6: HOLIDAY DAYTIME (NOT SUNDAY) ───────────────────
  it('V6: Mon 08:00-14:00 holiday Jul 20 TERR cap=420 break=60 → 300 festivoDiurno', () => {
    // Jul 20 2026 is Monday
    // 360 presence, effective=300
    // Holiday: isRestDay=true, isHoliday=true
    // All daytime, within cap
    const r = engine.classify({
      startTime: makeDate('2026-07-20T08:00:00'),
      endTime: makeDate('2026-07-20T14:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-20')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(300);
    expect(r.festivoDiurno).toBe(300);
    expect(r.dominicalDiurno).toBe(0);
    expect(r.ordinarioDiurno).toBe(0);
    invariant(r, 'V6');
  });

  // ─── V7: SUNDAY NIGHT CROSSING TO MONDAY ────────────────
  it('V7: Sun 20:00-Mon 02:00 TERR cap=420 break=60 → 240 domNocturno + 60 ordNocturno', () => {
    // 360 presence, effective=300
    // Sun 20:00-24:00 = 240 min (night, Sunday)
    // Mon 00:00-02:00 = 60 min (night, Monday, not holiday)
    // Sunday portion: isRestDay=true, isHoliday=false, isNight=true, isOrdinary=true → dominicalNocturno
    // Monday portion: isRestDay=false, isNight=true, isOrdinary=true → ordinarioNocturno
    const r = engine.classify({
      startTime: makeDate('2026-07-12T20:00:00'),
      endTime: makeDate('2026-07-13T02:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(300);
    expect(r.dominicalNocturno).toBe(240);
    expect(r.ordinarioNocturno).toBe(60);
    expect(r.dominicalDiurno).toBe(0);
    expect(r.ordinarioDiurno).toBe(0);
    invariant(r, 'V7');
  });

  // ─── V8: EXTRA DAYTIME ──────────────────────────────────
  it('V8: Mon 07:00-19:00 ADMIN cap=540 break=60 → 540 ordDiurno + 120 extraDiurno', () => {
    // 720 presence, effective=660
    // 07:00-19:00 is all daytime (last minute 17:59 = minOfDay 1079 < 1140)
    // First 540 within cap → ordinarioDiurno
    // Next 120 beyond cap → extraDiurno
    const r = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T19:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(660);
    expect(r.ordinarioDiurno).toBe(540);
    expect(r.extraDiurno).toBe(120);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V8');
  });

  // ─── V9: DAY-TO-NIGHT TRANSITION ───────────────────────
  it('V9: Tue 18:00-22:00 TERR cap=420 break=60 → 60 ordDiurno + 120 ordNocturno', () => {
    // 240 presence, effective=180
    // 18:00-19:00 = 60 min daytime (minOfDay 1080-1139)
    // 19:00-22:00 = 120 min night (minOfDay 1140+)
    // All within daily cap=420
    const r = engine.classify({
      startTime: makeDate('2026-07-07T18:00:00'),
      endTime: makeDate('2026-07-07T22:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(180);
    expect(r.ordinarioDiurno).toBe(60);
    expect(r.ordinarioNocturno).toBe(120);
    invariant(r, 'V9');
  });

  // ─── V10: EXTRA NIGHT ──────────────────────────────────
  it('V10: Mon 07:00-22:00 ADMIN cap=540 break=60 → 540 ordD + 180 extD + 120 extN', () => {
    // 900 presence, effective=840
    // 07:00-16:00 = 540 min daytime within cap → ordinarioDiurno
    // 16:00-19:00 = 180 min daytime beyond cap → extraDiurno
    // 19:00-22:00 = 120 min nighttime beyond cap → extraNocturno
    // Note: 19:00 is NIGHT_START (minOfDay 1140), so 19:00+ is night
    const r = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T22:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(840);
    expect(r.ordinarioDiurno).toBe(540);
    expect(r.extraDiurno).toBe(180);
    expect(r.extraNocturno).toBe(120);
    invariant(r, 'V10');
  });

  // ─── V11: FRI-SAT CROSS (WEEKEND NIGHT) ────────────────
  it('V11: Fri 20:00-Sat 06:00 TERR cap=420 break=60 → 540 ordNocturno', () => {
    // 600 presence, effective=540
    // All night, Sat is NOT a rest day (not Sunday, not holiday)
    // dailyUsed resets between Fri and Sat, all within cap
    const r = engine.classify({
      startTime: makeDate('2026-07-10T20:00:00'),
      endTime: makeDate('2026-07-11T06:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(540);
    expect(r.ordinarioNocturno).toBe(540);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V11');
  });

  // ─── V12: WEEKLY CAP EXCEEDED ──────────────────────────
  it('V12: Mon 07:00-17:00 acc=2400 ADMIN cap=540 break=60 → 120 ordD + 420 extD', () => {
    // 600 presence, effective=540
    // weeklyTarget=2520, accumulated=2400, remaining=120
    // First 120 min: within daily cap AND weekly cap → ordinarioDiurno
    // Next 420 min: within daily cap but NOT weekly cap → extraDiurno
    const r = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T17:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 2400,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(540);
    expect(r.ordinarioDiurno).toBe(120);
    expect(r.extraDiurno).toBe(420);
    invariant(r, 'V12');
  });

  // ─── V13: SHORT SESSION (break >= presence) ─────────────
  it('V13: 30 min session → break=30, effective=0', () => {
    const r = engine.classify({
      startTime: makeDate('2026-07-06T10:00:00'),
      endTime: makeDate('2026-07-06T10:30:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.totalMinutes).toBe(30);
    expect(r.breakMinutes).toBe(30);
    expect(r.liquidableMinutes).toBe(0);
    expect(sumBuckets(r)).toBe(0);
  });

  // ─── V14: SUNDAY WITH WEEKLY LIMIT ─────────────────────
  it('V14: Sun 08:00-14:00 acc=2400 TERR cap=420 break=60 → 120 domDiurno + 180 extraDomDiurno', () => {
    // 360 presence, effective=300
    // weekly remaining = 120
    // First 120 min: within daily cap AND weekly → dominicalDiurno
    // Next 180 min: within daily cap but NOT weekly → extraDominicalFestivoDiurno
    const r = engine.classify({
      startTime: makeDate('2026-07-12T08:00:00'),
      endTime: makeDate('2026-07-12T14:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 2400,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(300);
    expect(r.dominicalDiurno).toBe(120);
    expect(r.extraDominicalFestivoDiurno).toBe(180);
    invariant(r, 'V14');
  });

  // ─── V15: FULL SUNDAY 00:00-23:59 ──────────────────────
  it('V15: Sun 00:00-23:59 TERR cap=420 break=60 → 360 domNocturno + 60 domDiurno + 720 extDomDiurno + 239 extDomNocturno', () => {
    // 1439 presence, effective=1379
    // 00:00-06:00 = 360 night → dominicalNocturno (all within cap)
    // 06:00-07:00 = 60 day → dominicalDiurno (dailyUsed=360→420=cap)
    // 07:00-19:00 = 720 day → extraDominicalFestivoDiurno (cap exceeded)
    // 19:00-23:59 = 239 night → extraDominicalFestivoNocturno
    const r = engine.classify({
      startTime: makeDate('2026-07-12T00:00:00'),
      endTime: makeDate('2026-07-12T23:59:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(1379);
    expect(r.dominicalNocturno).toBe(360);
    expect(r.dominicalDiurno).toBe(60);
    expect(r.extraDominicalFestivoDiurno).toBe(720);
    expect(r.extraDominicalFestivoNocturno).toBe(239);
    invariant(r, 'V15');
  });

  // ─── V16: SATURDAY (ordinary weekday) ──────────────────
  it('V16: Sat 08:00-17:00 TERR cap=420 break=60 → 420 ordDiurno + 60 extraDiurno', () => {
    // 540 presence, effective=480
    // Saturday is NOT a rest day (only Sunday and holidays)
    // First 420 within cap → ordinarioDiurno
    // Next 60 beyond cap → extraDiurno
    const r = engine.classify({
      startTime: makeDate('2026-07-11T08:00:00'),
      endTime: makeDate('2026-07-11T17:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(480);
    expect(r.ordinarioDiurno).toBe(420);
    expect(r.extraDiurno).toBe(60);
    invariant(r, 'V16');
  });

  // ─── V17: ADMIN NIGHT CROSSING MIDNIGHT ────────────────
  it('V17: Mon 19:00-Tue 06:00 ADMIN cap=540 break=60 → 600 ordNocturno', () => {
    // 660 presence, effective=600
    // All night, dailyUsed resets between days, all within cap=540
    const r = engine.classify({
      startTime: makeDate('2026-07-06T19:00:00'),
      endTime: makeDate('2026-07-07T06:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(600);
    expect(r.ordinarioNocturno).toBe(600);
    expect(r.ordinarioDiurno).toBe(0);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V17');
  });

  // ─── V18: HOLIDAY NIGHT CROSSING MIDNIGHT ──────────────
  it('V18: Jul 20(hol) 22:00 - Jul 21 06:00 TERR cap=420 break=60 → 120 festivoNocturno + 300 ordNocturno', () => {
    // 480 presence, effective=420
    // Jul 20 is Monday holiday. Jul 21 is Tuesday (not holiday, not Sunday).
    // Jul 20 22:00-24:00 = 120 night, holiday → festivoNocturno
    // Jul 21 00:00-06:00 = 300 night, not holiday, not Sunday → ordinarioNocturno
    const r = engine.classify({
      startTime: makeDate('2026-07-20T22:00:00'),
      endTime: makeDate('2026-07-21T06:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-20')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(420);
    expect(r.festivoNocturno).toBe(120);
    expect(r.ordinarioNocturno).toBe(300);
    invariant(r, 'V18');
  });

  // ─── V19: HOLIDAY + SUNDAY SAME DAY ────────────────────
  it('V19: Sun Jul 19(hol) 08:00-14:00 TERR cap=420 break=60 → 300 festivoDiurno (holiday wins)', () => {
    // Jul 19 2026 is Sunday AND a holiday (San Juan/Día del Sol, commonly moved)
    // When both Sunday AND holiday, isHoliday takes precedence in bucket assignment
    // isRestDay=true, isHoliday=true → festivoDiurno (not dominicalDiurno)
    const r = engine.classify({
      startTime: makeDate('2026-07-19T08:00:00'),
      endTime: makeDate('2026-07-19T14:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-19')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(300);
    expect(r.festivoDiurno).toBe(300);
    expect(r.dominicalDiurno).toBe(0);
    invariant(r, 'V19');
  });

  // ─── V20: WEEKLY EXHAUSTED (all extra) ─────────────────
  it('V20: Mon 07:00-15:00 acc=2520 ADMIN cap=540 break=60 → 420 extraDiurno', () => {
    // 480 presence, effective=420
    // weeklyUsed already at 2520=target, no ordinary minutes left
    const r = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T15:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 2520,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(420);
    expect(r.extraDiurno).toBe(420);
    expect(r.ordinarioDiurno).toBe(0);
    invariant(r, 'V20');
  });

  // ─── V21: CROSS-MONTH NIGHT SHIFT ──────────────────────
  it('V21: Jun 30(Tue) 20:00 - Jul 1(Wed) 05:00 TERR cap=420 break=60 → 480 ordNocturno', () => {
    // 540 presence, effective=480
    // All night, daily caps reset between days
    const r = engine.classify({
      startTime: makeDate('2026-06-30T20:00:00'),
      endTime: makeDate('2026-07-01T05:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(480);
    expect(r.ordinarioNocturno).toBe(480);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V21');
  });

  // ─── V22: EXACTLY 19:00 TRANSITION ─────────────────────
  it('V22: Mon 06:00-19:00 TERR cap=420 break=60 → 420 ordDiurno (19:00 is night)', () => {
    // 780 presence, effective=720
    // 06:00-19:00: minutes 360-1139 are daytime (minOfDay < 1140)
    // At exactly 19:00 = minOfDay 1140 = NIGHT_START, so 19:00 is NIGHT
    // First 420 within cap → ordinarioDiurno
    // Next 300 beyond cap → extraDiurno
    // The loop runs i=0 to i<720 (effectiveMinutes)
    // i=0 → 06:00, i=719 → 17:59 (still daytime since 1079 < 1140)
    // So all 720 minutes are daytime
    const r = engine.classify({
      startTime: makeDate('2026-07-06T06:00:00'),
      endTime: makeDate('2026-07-06T19:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(720);
    expect(r.ordinarioDiurno).toBe(420);
    expect(r.extraDiurno).toBe(300);
    expect(r.ordinarioNocturno).toBe(0);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V22');
  });

  // ─── V23: 19:00-05:00 FULL NIGHT ──────────────────────
  it('V23: Mon 19:00-Tue 05:00 TERR cap=420 break=60 → 540 ordNocturno', () => {
    // 600 presence, effective=540
    // All minutes night (19:00=1140, 05:00=300)
    const r = engine.classify({
      startTime: makeDate('2026-07-06T19:00:00'),
      endTime: makeDate('2026-07-07T05:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(540);
    expect(r.ordinarioNocturno).toBe(540);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V23');
  });

  // ─── V24: DOUBLE REST DAY (Sunday + Holiday) ───────────
  it('V24: Mon Jul 20(hol) 19:00-Tue Jul 21 05:00 TERR cap=420 break=60 → 300 festNoct + 240 ordNoct', () => {
    // 600 presence, effective=540
    // Jul 20 19:00-24:00 = 300 min night, holiday → festivoNocturno
    // Jul 21 00:00-05:00 = 300 min night, but effective=540 so only 240 more minutes
    // Jul 21 00:00-04:00 = 240 min night, not holiday → ordinarioNocturno
    const r = engine.classify({
      startTime: makeDate('2026-07-20T19:00:00'),
      endTime: makeDate('2026-07-21T05:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-20')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.totalMinutes).toBe(600);
    expect(r.liquidableMinutes).toBe(540);
    // Jul 20 19:00-24:00 = 300 night holiday → festivoNocturno
    // Jul 21 00:00-04:00 = 240 night ordinary → ordinarioNocturno (540-300=240)
    expect(r.festivoNocturno).toBe(300);
    expect(r.ordinarioNocturno).toBe(240);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V24');
  });

  // ─── V25: ZERO MINUTES ────────────────────────────────
  it('V25: Zero-duration session → all zeros', () => {
    const r = engine.classify({
      startTime: makeDate('2026-07-06T10:00:00'),
      endTime: makeDate('2026-07-06T10:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.totalMinutes).toBe(0);
    expect(r.liquidableMinutes).toBe(0);
    invariant(r, 'V25');
  });

  // ─── V26: BREAK=0 ─────────────────────────────────────
  it('V26: Mon 07:00-15:00 ADMIN cap=540 break=0 → 480 ordDiurno', () => {
    // 480 presence, no break, effective=480
    const r = engine.classify({
      startTime: makeDate('2026-07-06T07:00:00'),
      endTime: makeDate('2026-07-06T15:00:00'),
      ordinaryDistributions: adminDists([1, 2, 3, 4, 5], 540),
      holidays: [],
      workModality: 'ADMINISTRATIVO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 0,
    });
    expect(r.totalMinutes).toBe(480);
    expect(r.breakMinutes).toBe(0);
    expect(r.liquidableMinutes).toBe(480);
    expect(r.ordinarioDiurno).toBe(480);
    invariant(r, 'V26');
  });

  // ─── V27: CAP=0 (ALL EXTRA) ───────────────────────────
  it('V27: Mon cap=0 08:00-16:00 TERR break=60 → 420 extraDiurno', () => {
    // 480 presence, effective=420
    // Monday cap=0, all minutes are extra
    const dists = Array.from({ length: 7 }, (_, dow) => ({
      dayOfWeek: dow,
      ordinaryMinutesCap: dow === 1 ? 0 : 420,
    }));
    const r = engine.classify({
      startTime: makeDate('2026-07-06T08:00:00'),
      endTime: makeDate('2026-07-06T16:00:00'),
      ordinaryDistributions: dists,
      holidays: [],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(420);
    expect(r.extraDiurno).toBe(420);
    expect(r.ordinarioDiurno).toBe(0);
    invariant(r, 'V27');
  });

  // ─── V28: HOLIDAY EXCEEDS CAP ──────────────────────────
  it('V28: Mon Jul 20(hol) 08:00-18:00 TERR cap=420 break=60 → 420 festDiurno + 120 extDomFestDiurno', () => {
    // 600 presence, effective=540
    // Holiday: isRestDay=true, isHoliday=true
    // First 420 within cap → festivoDiurno
    // Next 120 beyond cap → extraDominicalFestivoDiurno
    const r = engine.classify({
      startTime: makeDate('2026-07-20T08:00:00'),
      endTime: makeDate('2026-07-20T18:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-20')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.liquidableMinutes).toBe(540);
    expect(r.festivoDiurno).toBe(420);
    expect(r.extraDominicalFestivoDiurno).toBe(120);
    invariant(r, 'V28');
  });

  // ─── V29: HOLIDAY NIGHT EXCEEDS CAP ────────────────────
  it('V29: Mon Jul 20(hol) 19:00-Tue Jul 21 07:00 TERR cap=420 break=60 → 300 festNoct + 360 ordNoct', () => {
    // 720 presence, effective=660
    // Jul 20 19:00-24:00 = 300 min night, holiday → festivoNocturno (dailyUsed=300)
    // Jul 21 00:00-06:00 = 360 min night, not holiday, Tuesday → ordinarioNocturno
    // Jul 21 06:00-07:00 = 60 min day, not holiday → ordinarioDiurno
    // Total: 300 + 360 + 60 = 720 > 660... wait, effective=660
    // Let me recalculate: 720 presence, break=60, effective=660
    // First 300 min (Jul 20 19:00-24:00): festivoNocturno, dailyUsed=300
    // Next 360 min (Jul 21 00:00-06:00): ordNocturno, dailyUsed=360
    // Remaining 0 min... wait that's already 660 = 300+360
    // Hmm, 720 - 60 = 660 effective. 300 + 360 = 660. So all accounted for.
    const r = engine.classify({
      startTime: makeDate('2026-07-20T19:00:00'),
      endTime: makeDate('2026-07-21T07:00:00'),
      ordinaryDistributions: territoryDists(420),
      holidays: [localDate('2026-07-20')],
      workModality: 'TERRITORIO',
      weeklyTargetMinutes: 2520,
      accumulatedWeekMinutes: 0,
      breakMinutes: 60,
    });
    expect(r.totalMinutes).toBe(720);
    expect(r.liquidableMinutes).toBe(660);
    expect(r.festivoNocturno).toBe(300);
    expect(r.ordinarioNocturno).toBe(360);
    expect(r.extraNocturno).toBe(0);
    invariant(r, 'V29');
  });
});
