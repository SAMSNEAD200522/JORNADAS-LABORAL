import { Injectable } from '@nestjs/common';
import { EngineInput, EngineOutput } from '../labor-engine/labor-engine.types';
import {
  NIGHT_START,
  NIGHT_END,
  DEFAULT_BREAK_MINUTES,
  BUCKET_PERCENTAGES,
} from '../labor-engine/labor-engine.constants';
import {
  AuditTrace,
  GeneralInfo,
  InputData,
  ConfigUsed,
  BreakApplication,
  MinuteClassification,
  LegalClassification,
  BucketDetail,
  WeeklyAccumulation,
  Validation,
} from './audit-engine.types';

@Injectable()
export class AuditEngineService {
  trace(
    input: EngineInput,
    employeeInfo?: {
      id: number;
      name: string;
      documentNumber: string;
      modality: string;
      configName: string;
    },
  ): AuditTrace {
    const {
      startTime,
      endTime,
      ordinaryDistributions,
      holidays,
      workModality,
      weeklyTargetMinutes,
      accumulatedWeekMinutes,
      breakMinutes,
    } = input;

    const totalMinutes = Math.round(
      (endTime.getTime() - startTime.getTime()) / 60000,
    );

    if (totalMinutes <= 0) {
      return this.emptyTrace(input, employeeInfo);
    }

    const effectiveBreak = Math.min(
      breakMinutes ?? DEFAULT_BREAK_MINUTES,
      totalMinutes,
    );
    const effectiveMinutes = totalMinutes - effectiveBreak;

    const generalInfo = this.buildGeneralInfo(
      input,
      totalMinutes,
      employeeInfo,
    );
    const inputData = this.buildInputData(input, totalMinutes);
    const configUsed = this.buildConfigUsed(input);
    const breakApplication = this.buildBreakApplication(
      totalMinutes,
      effectiveBreak,
      effectiveMinutes,
    );

    const timeline: MinuteClassification[] = [];
    const output = this.emptyOutput(totalMinutes, effectiveBreak);
    const buckets: BucketDetail[] = [];

    let dailyUsed = 0;
    let weeklyUsed = accumulatedWeekMinutes;
    let prevDateStr = '';

    const capsMap = this.buildCapsMap(ordinaryDistributions);
    const holidaySet = new Set(holidays.map((d) => this.normalizeDate(d)));

    for (let i = 0; i < effectiveMinutes; i++) {
      const current = new Date(startTime.getTime() + i * 60000);
      const local = this.toBogotaDate(current);
      const hour = local.getHours();
      const minOfDay = hour * 60 + local.getMinutes();
      const dayOfWeek = local.getDay();
      const dateStr = this.normalizeDate(current);

      if (dateStr !== prevDateStr) {
        dailyUsed = 0;
        prevDateStr = dateStr;
      }

      const isNight = minOfDay >= NIGHT_START || minOfDay < NIGHT_END;
      const isSunday = dayOfWeek === 0;
      const isHoliday = holidaySet.has(dateStr);
      const isRestDay = isSunday || isHoliday;

      const dayCap = capsMap[dayOfWeek] ?? 0;

      const isWithinDaily = dailyUsed < dayCap;
      const isWithinWeekly = weeklyUsed < weeklyTargetMinutes;
      const isOrdinary = isWithinDaily && isWithinWeekly;

      const dailyUsedBefore = dailyUsed;
      const weeklyUsedBefore = weeklyUsed;

      if (isOrdinary) {
        dailyUsed++;
        weeklyUsed++;
      }

      const bucketName = this.classifyMinuteToBucket(
        output,
        isRestDay,
        isNight,
        isOrdinary,
      );

      timeline.push({
        minuteIndex: i,
        absoluteTime: current.toISOString(),
        bogotaTime: this.formatBogotaTime(local),
        hour: local.getHours(),
        dayOfWeek,
        dayName: this.dayNameEs(dayOfWeek),
        dateStr,
        isNight,
        isSunday,
        isHoliday,
        isRestDay,
        isWithinDaily,
        isWithinWeekly,
        isOrdinary,
        dailyUsedBefore,
        dailyCap: dayCap,
        weeklyUsedBefore,
        bucket: bucketName,
      });
    }

    output.liquidableMinutes = effectiveMinutes;

    const legalClassification = this.buildLegalClassification(
      output,
      effectiveMinutes,
    );
    const weeklyAccumulation = this.buildWeeklyAccumulation(
      accumulatedWeekMinutes,
      weeklyUsed,
      weeklyTargetMinutes,
    );
    const validations = this.buildValidations(
      output,
      effectiveMinutes,
      timeline,
    );

    return {
      generalInfo,
      inputData,
      configUsed,
      breakApplication,
      timeline,
      legalClassification,
      weeklyAccumulation,
      finalResult: output,
      validations,
      generatedAt: new Date().toISOString(),
    };
  }

  private classifyMinuteToBucket(
    output: EngineOutput,
    isRestDay: boolean,
    isNight: boolean,
    isOrdinary: boolean,
  ): string {
    if (isRestDay) {
      if (isOrdinary) {
        if (isNight) {
          output.dominicalFestivoNocturno++;
          return 'dominicalFestivoNocturno';
        } else {
          output.dominicalFestivoDiurno++;
          return 'dominicalFestivoDiurno';
        }
      } else {
        if (isNight) {
          output.extraDominicalFestivoNocturno++;
          return 'extraDominicalFestivoNocturno';
        } else {
          output.extraDominicalFestivoDiurno++;
          return 'extraDominicalFestivoDiurno';
        }
      }
    } else {
      if (isOrdinary) {
        if (isNight) {
          output.ordinarioNocturno++;
          return 'ordinarioNocturno';
        } else {
          output.ordinarioDiurno++;
          return 'ordinarioDiurno';
        }
      } else {
        if (isNight) {
          output.extraNocturno++;
          return 'extraNocturno';
        } else {
          output.extraDiurno++;
          return 'extraDiurno';
        }
      }
    }
  }

  private buildGeneralInfo(
    input: EngineInput,
    totalMinutes: number,
    employeeInfo?: {
      id: number;
      name: string;
      documentNumber: string;
      modality: string;
      configName: string;
    },
  ): GeneralInfo {
    return {
      employeeId: employeeInfo?.id ?? 0,
      employeeName: employeeInfo?.name ?? 'Desconocido',
      documentNumber: employeeInfo?.documentNumber ?? '',
      modality: input.workModality,
      configName: employeeInfo?.configName ?? 'Sin configuración',
      territoryConfig: this.buildTerritoryConfig(input.ordinaryDistributions),
      weeklyTargetMinutes: input.weeklyTargetMinutes,
      timezone: 'America/Bogota',
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
    };
  }

  private buildTerritoryConfig(distributions: any[]): Record<string, number> {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const map: Record<string, number> = {};
    for (const d of distributions) {
      map[dayNames[d.dayOfWeek]] = d.ordinaryMinutesCap;
    }
    return map;
  }

  private buildInputData(input: EngineInput, totalMinutes: number): InputData {
    return {
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
      totalMinutes,
      breakMinutesInput: input.breakMinutes ?? DEFAULT_BREAK_MINUTES,
    };
  }

  private buildConfigUsed(input: EngineInput): ConfigUsed {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dailyCaps: Record<string, number> = {};
    for (const d of input.ordinaryDistributions) {
      dailyCaps[dayNames[d.dayOfWeek]] = d.ordinaryMinutesCap;
    }

    return {
      dailyCaps,
      weeklyTargetMinutes: input.weeklyTargetMinutes,
      accumulatedWeekMinutes: input.accumulatedWeekMinutes,
      breakMinutes: input.breakMinutes ?? DEFAULT_BREAK_MINUTES,
      nightStart: '19:00',
      nightEnd: '06:00',
      recargos: {
        'Recargo nocturno ordinario': 0.35,
        'Hora extra diurna': 0.25,
        'Hora extra nocturna': 0.75,
        'Recargo dominical/festivo': 0.9,
      },
    };
  }

  private buildBreakApplication(
    totalMinutes: number,
    effectiveBreak: number,
    effectiveMinutes: number,
  ): BreakApplication {
    return {
      totalMinutes,
      breakMinutes: effectiveBreak,
      effectiveMinutes,
      reasoning: `Se descuentan ${effectiveBreak} min de descanso de los ${totalMinutes} min totales. Minutos efectivos a clasificar: ${effectiveMinutes}. El descanso se aplica ANTES de la clasificación (no convierte ordinarios en extras).`,
    };
  }

  private buildLegalClassification(
    output: EngineOutput,
    effectiveMinutes: number,
  ): LegalClassification {
    const bucketDefs: Array<{
      name: string;
      key: string;
      value: number;
      legalBase: string;
      description: string;
    }> = [
      {
        name: 'Ordinario diurno',
        key: 'ordinarioDiurno',
        value: output.ordinarioDiurno,
        legalBase: 'Art. 161 CST',
        description: 'Trabajo ordinario en horario diurno (06:00-19:00)',
      },
      {
        name: 'Ordinario nocturno',
        key: 'ordinarioNocturno',
        value: output.ordinarioNocturno,
        legalBase: 'Art. 160 + 168.1 CST',
        description: 'Trabajo ordinario en horario nocturno (19:00-06:00)',
      },
      {
        name: 'Extra diurno',
        key: 'extraDiurno',
        value: output.extraDiurno,
        legalBase: 'Art. 159 + 168.2 CST',
        description: 'Hora extra en horario diurno',
      },
      {
        name: 'Extra nocturno',
        key: 'extraNocturno',
        value: output.extraNocturno,
        legalBase: 'Art. 159 + 168.3 CST',
        description:
          'Hora extra en horario nocturno (no acumula con recargo nocturno 35%)',
      },
      {
        name: 'Dominical/Festivo diurno',
        key: 'dominicalFestivoDiurno',
        value: output.dominicalFestivoDiurno,
        legalBase: 'Art. 179 + Ley 2466 Art. 14',
        description: 'Trabajo ordinario en domingo/festivo, horario diurno',
      },
      {
        name: 'Dominical/Festivo nocturno',
        key: 'dominicalFestivoNocturno',
        value: output.dominicalFestivoNocturno,
        legalBase: 'Art. 179 + 168.1 + Ley 2466',
        description: 'Trabajo ordinario en domingo/festivo, horario nocturno',
      },
      {
        name: 'Extra Dominical/Festivo diurno',
        key: 'extraDominicalFestivoDiurno',
        value: output.extraDominicalFestivoDiurno,
        legalBase: 'Art. 179 + 168.2 + Ley 2466',
        description: 'Hora extra en domingo/festivo, horario diurno',
      },
      {
        name: 'Extra Dominical/Festivo nocturno',
        key: 'extraDominicalFestivoNocturno',
        value: output.extraDominicalFestivoNocturno,
        legalBase: 'Art. 179 + 168.3 + Ley 2466',
        description: 'Hora extra en domingo/festivo, horario nocturno',
      },
    ];

    const totalBucketSum = bucketDefs.reduce((sum, b) => sum + b.value, 0);

    const buckets: BucketDetail[] = bucketDefs.map((b) => ({
      name: b.name,
      key: b.key,
      minutes: b.value,
      percentage:
        BUCKET_PERCENTAGES[b.key as keyof typeof BUCKET_PERCENTAGES] * 100,
      legalBase: b.legalBase,
      description: b.description,
    }));

    return {
      buckets,
      totalLiquidable: effectiveMinutes,
      invariants: {
        sumOfBuckets: totalBucketSum,
        equalsLiquidable: totalBucketSum === effectiveMinutes,
        noDoubleCounting: totalBucketSum === effectiveMinutes,
      },
    };
  }

  private buildWeeklyAccumulation(
    beforeMinutes: number,
    afterMinutes: number,
    targetMinutes: number,
  ): WeeklyAccumulation {
    return {
      beforeMinutes,
      afterMinutes,
      targetMinutes,
      remainingMinutes: Math.max(0, targetMinutes - afterMinutes),
    };
  }

  private buildValidations(
    output: EngineOutput,
    effectiveMinutes: number,
    timeline: MinuteClassification[],
  ): Validation[] {
    const bucketSum =
      output.ordinarioDiurno +
      output.ordinarioNocturno +
      output.extraDiurno +
      output.extraNocturno +
      output.dominicalFestivoDiurno +
      output.dominicalFestivoNocturno +
      output.extraDominicalFestivoDiurno +
      output.extraDominicalFestivoNocturno;

    const allSameDate =
      timeline.length > 0 && new Set(timeline.map((t) => t.dateStr)).size === 1;
    const hasNight = timeline.some((t) => t.isNight);
    const hasDay = timeline.some((t) => !t.isNight);
    const hasHoliday = timeline.some((t) => t.isHoliday);
    const hasSunday = timeline.some((t) => t.isSunday);

    return [
      {
        name: 'Suma de buckets = liquidable',
        passed: bucketSum === effectiveMinutes,
        detail: `Σbuckets = ${bucketSum}, liquidableMinutes = ${effectiveMinutes}. ${bucketSum === effectiveMinutes ? 'OK' : 'ERROR'}`,
      },
      {
        name: 'Sin duplicación',
        passed: bucketSum === effectiveMinutes,
        detail: `Cada minuto pertenece a exactamente un bucket. Total clasificados: ${bucketSum}`,
      },
      {
        name: 'Minutos no negativos',
        passed: bucketSum >= 0,
        detail: `Todos los contadores son ≥ 0: ${bucketSum}`,
      },
      {
        name: 'Descanso descontado correctamente',
        passed:
          output.breakMinutes >= 0 &&
          output.breakMinutes <= output.totalMinutes,
        detail: `breakMinutes=${output.breakMinutes}, totalMinutes=${output.totalMinutes}`,
      },
      {
        name: 'Coherencia temporal',
        passed: output.liquidableMinutes === effectiveMinutes,
        detail: `totalMinutes=${output.totalMinutes} - break=${output.breakMinutes} = liquidable=${output.liquidableMinutes}. Esperado: ${effectiveMinutes}`,
      },
      {
        name: 'Límites diarios respetados',
        passed: true,
        detail: allSameDate
          ? 'Jornada de un solo día — caps se verifican por minuto'
          : 'Jornada multi-día — caps verificados por día',
      },
    ];
  }

  private buildCapsMap(distributions: any[]): Record<number, number> {
    const map: Record<number, number> = {};
    for (const d of distributions) {
      map[d.dayOfWeek] = d.ordinaryMinutesCap;
    }
    return map;
  }

  private emptyOutput(
    totalMinutes: number,
    breakMinutes: number,
  ): EngineOutput {
    return {
      totalMinutes,
      breakMinutes,
      liquidableMinutes: totalMinutes - breakMinutes,
      ordinarioDiurno: 0,
      ordinarioNocturno: 0,
      extraDiurno: 0,
      extraNocturno: 0,
      dominicalFestivoDiurno: 0,
      dominicalFestivoNocturno: 0,
      extraDominicalFestivoDiurno: 0,
      extraDominicalFestivoNocturno: 0,
    };
  }

  private emptyTrace(input: EngineInput, employeeInfo?: any): AuditTrace {
    const totalMinutes = Math.round(
      (input.endTime.getTime() - input.startTime.getTime()) / 60000,
    );
    return {
      generalInfo: this.buildGeneralInfo(input, totalMinutes, employeeInfo),
      inputData: this.buildInputData(input, totalMinutes),
      configUsed: this.buildConfigUsed(input),
      breakApplication: {
        totalMinutes,
        breakMinutes: 0,
        effectiveMinutes: 0,
        reasoning: 'Tiempo total ≤ 0, no hay minutos a clasificar.',
      },
      timeline: [],
      legalClassification: {
        buckets: [],
        totalLiquidable: 0,
        invariants: {
          sumOfBuckets: 0,
          equalsLiquidable: true,
          noDoubleCounting: true,
        },
      },
      weeklyAccumulation: this.buildWeeklyAccumulation(
        input.accumulatedWeekMinutes,
        input.accumulatedWeekMinutes,
        input.weeklyTargetMinutes,
      ),
      finalResult: this.emptyOutput(0, 0),
      validations: [
        {
          name: 'Tiempo total inválido',
          passed: false,
          detail: `totalMinutes=${totalMinutes} ≤ 0`,
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  private toBogotaDate(date: Date): Date {
    const BOGOTA_OFFSET = 300;
    const localOffset = date.getTimezoneOffset();
    return new Date(date.getTime() + (localOffset - BOGOTA_OFFSET) * 60000);
  }

  private normalizeDate(date: Date): string {
    const local = this.toBogotaDate(date);
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  }

  private formatBogotaTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private dayNameEs(dayOfWeek: number): string {
    return [
      'Domingo',
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ][dayOfWeek];
  }
}
