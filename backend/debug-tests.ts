import { LaborEngineService } from './src/labor-engine/labor-engine.service';

const engine = new LaborEngineService();

function makeDate(iso: string): Date {
  return new Date(iso);
}

function analyze(startIso: string, endIso: string, label: string, acc: number = 0) {
  const start = makeDate(startIso);
  const end = makeDate(endIso);

  const result = engine.classify({
    startTime: start,
    endTime: end,
    ordinaryDistributions: Array.from({ length: 7 }, (_, dow) => ({
      dayOfWeek: dow,
      ordinaryMinutesCap: 420,
    })),
    holidays: [],
    workModality: 'TERRITORIO' as const,
    weeklyTargetMinutes: 2520,
    accumulatedWeekMinutes: acc,
    breakMinutes: 60,
  });

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`${label}`);
  console.log(`Session: ${startIso} → ${endIso}`);
  console.log(`total=${result.totalMinutes} break=${result.breakMinutes} liquidable=${result.liquidableMinutes}`);
  console.log(`ordDiurno=${result.ordinarioDiurno} ordNocturno=${result.ordinarioNocturno}`);
  console.log(`extraDiurno=${result.extraDiurno} extraNocturno=${result.extraNocturno}`);
  console.log(`domDiurno=${result.dominicalDiurno} festDiurno=${result.festivoDiurno} domNocturno=${result.dominicalNocturno} festNocturno=${result.festivoNocturno}`);
  console.log(`extraDomDiurno=${result.extraDominicalFestivoDiurno} extraDomNocturno=${result.extraDominicalFestivoNocturno}`);
}

analyze('2026-07-08T08:00:00', '2026-07-08T16:00:00', 'Test 20: 08-16 (8h)');
analyze('2026-07-08T08:00:00', '2026-07-08T17:00:00', 'Test 21: 08-17 (9h)');
analyze('2026-07-08T20:00:00', '2026-07-09T05:00:00', 'Test 22/33: 20-05 (9h)');
analyze('2026-07-08T19:00:00', '2026-07-09T08:00:00', 'Test 23/34: 19-08 (13h)');
analyze('2026-07-12T08:00:00', '2026-07-12T18:00:00', 'Test 25: Sun 08-18 (10h)');
analyze('2026-07-08T08:00:00', '2026-07-08T16:00:00', 'Test 28: 08-16 acc=2400', 2400);
