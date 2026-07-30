/**
 * Motor de Liquidación de Jornadas Laborales
 *
 * Pipeline de cálculo organizado en etapas aisladas.
 * Cada etapa puede modificarse sin afectar las demás.
 *
 * Basado en: CST Art. 158-179 + Ley 2466/2025 + Ley 2101/2021
 *
 * Invariante: Σ(B1...B8) = liquidableMinutes (siempre).
 */
import { Injectable } from '@nestjs/common';
import {
  EngineInput,
  EngineOutput,
  OrdinaryDistributionInfo,
} from './labor-engine.types';
import {
  NIGHT_START,
  NIGHT_END,
  DEFAULT_BREAK_MINUTES,
} from './labor-engine.constants';

@Injectable()
export class LaborEngineService {
  // ────────────────────────────────────────────────────────────────
  // ETAPA 0: Punto de entrada público
  // ────────────────────────────────────────────────────────────────
  classify(input: EngineInput): EngineOutput {
    const totalMinutes = this.calculateTotalDuration(input);
    if (totalMinutes <= 0) {
      return this.emptyOutput(0, 0);
    }

    const { effectiveBreak, effectiveMinutes, breakStart } = this.determineBreak(
      totalMinutes,
      input.breakMinutes,
      input.breakThresholdMinutes,
    );
    if (effectiveMinutes <= 0) {
      return this.emptyOutput(totalMinutes, effectiveBreak);
    }

    const ctx = this.buildClassificationContext(input, effectiveBreak);
    this.classifyMinutes(ctx, input, totalMinutes, breakStart, effectiveBreak);

    ctx.output.liquidableMinutes = effectiveMinutes;
    return ctx.output;
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 1: Calcular duración total
  // ────────────────────────────────────────────────────────────────
  private calculateTotalDuration(input: EngineInput): number {
    return Math.round(
      (input.endTime.getTime() - input.startTime.getTime()) / 60000,
    );
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 2: Determinar descanso
  // ────────────────────────────────────────────────────────────────
  private determineBreak(
    totalMinutes: number,
    breakMinutes?: number,
    breakThresholdMinutes?: number | null,
  ): { effectiveBreak: number; effectiveMinutes: number; breakStart: number } {
    const effectiveBreak = Math.min(
      breakMinutes ?? DEFAULT_BREAK_MINUTES,
      totalMinutes,
    );
    const breakStart = breakThresholdMinutes != null
      ? Math.min(breakThresholdMinutes, totalMinutes - effectiveBreak)
      : totalMinutes - effectiveBreak;
    return {
      effectiveBreak,
      effectiveMinutes: totalMinutes - effectiveBreak,
      breakStart,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 3: Construir contexto de clasificación
  // ────────────────────────────────────────────────────────────────
  private buildClassificationContext(
    input: EngineInput,
    effectiveBreak: number,
  ): {
    output: EngineOutput;
    capsMap: Record<number, number>;
    holidaySet: Set<string>;
  } {
    const capsMap = this.buildCapsMap(input.ordinaryDistributions);
    const holidaySet = new Set(
      input.holidays.map((d) => this.normalizeDate(d)),
    );
    const output = this.emptyOutput(
      this.calculateTotalDuration(input),
      effectiveBreak,
    );
    return { output, capsMap, holidaySet };
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 4: Clasificar minutos uno a uno
  // ────────────────────────────────────────────────────────────────
  private classifyMinutes(
    ctx: {
      output: EngineOutput;
      capsMap: Record<number, number>;
      holidaySet: Set<string>;
    },
    input: EngineInput,
    totalMinutes: number,
    breakStart: number,
    breakDuration: number,
  ): void {
    const { output, capsMap, holidaySet } = ctx;
    let dailyUsed = 0;
    let weeklyUsed = input.accumulatedWeekMinutes;
    let prevDateStr = '';
    const breakEnd = breakStart + breakDuration;

    for (let i = 0; i < totalMinutes; i++) {
      if (i >= breakStart && i < breakEnd) {
        continue;
      }

      const current = new Date(input.startTime.getTime() + i * 60000);
      const local = this.toBogotaDate(current);
      const hour = local.getHours();
      const minOfDay = hour * 60 + local.getMinutes();
      const dayOfWeek = local.getDay();
      const dateStr = this.normalizeDate(current);

      if (dateStr !== prevDateStr) {
        dailyUsed = 0;
        prevDateStr = dateStr;
      }

      const { isOrdinary, dailyUsed: newDailyUsed, weeklyUsed: newWeeklyUsed } =
        this.evaluateCapacities(
          dailyUsed, weeklyUsed, dayOfWeek,
          capsMap, input.weeklyTargetMinutes,
        );

      dailyUsed = newDailyUsed;
      weeklyUsed = newWeeklyUsed;

      const isNight = minOfDay >= NIGHT_START || minOfDay < NIGHT_END;
      const isSunday = dayOfWeek === 0;
      const isHoliday = holidaySet.has(dateStr);
      const isRestDay = isSunday || isHoliday;

      this.classifyMinute(output, isRestDay, isHoliday, isNight, isOrdinary);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 5: Evaluar capacidades (diaria y semanal)
  // ────────────────────────────────────────────────────────────────
  private evaluateCapacities(
    dailyUsed: number,
    weeklyUsed: number,
    dayOfWeek: number,
    capsMap: Record<number, number>,
    weeklyTargetMinutes: number,
  ): { isOrdinary: boolean; dailyUsed: number; weeklyUsed: number } {
    const dayCap = capsMap[dayOfWeek] ?? 0;
    const isWithinDaily = dailyUsed < dayCap;
    const isWithinWeekly = weeklyUsed < weeklyTargetMinutes;
    const isOrdinary = isWithinDaily && isWithinWeekly;

    if (isOrdinary) {
      dailyUsed++;
      weeklyUsed++;
    }

    return { isOrdinary, dailyUsed, weeklyUsed };
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 6: Clasificar un minuto en su bucket
  // ────────────────────────────────────────────────────────────────
  private classifyMinute(
    output: EngineOutput,
    isRestDay: boolean,
    isHoliday: boolean,
    isNight: boolean,
    isOrdinary: boolean,
  ): void {
    if (isRestDay) {
      if (isHoliday) {
        if (isOrdinary) {
          if (isNight) {
            output.festivoNocturno++;
          } else {
            output.festivoDiurno++;
          }
        } else {
          if (isNight) {
            output.extraDominicalFestivoNocturno++;
          } else {
            output.extraDominicalFestivoDiurno++;
          }
        }
      } else {
        if (isOrdinary) {
          if (isNight) {
            output.dominicalNocturno++;
          } else {
            output.dominicalDiurno++;
          }
        } else {
          if (isNight) {
            output.extraDominicalFestivoNocturno++;
          } else {
            output.extraDominicalFestivoDiurno++;
          }
        }
      }
    } else {
      if (isOrdinary) {
        if (isNight) {
          output.ordinarioNocturno++;
        } else {
          output.ordinarioDiurno++;
        }
      } else {
        if (isNight) {
          output.extraNocturno++;
        } else {
          output.extraDiurno++;
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 7: Construir mapa de capacidades diarias
  // ────────────────────────────────────────────────────────────────
  private buildCapsMap(
    distributions: OrdinaryDistributionInfo[],
  ): Record<number, number> {
    const map: Record<number, number> = {};
    for (const d of distributions) {
      map[d.dayOfWeek] = d.ordinaryMinutesCap;
    }
    return map;
  }

  // ────────────────────────────────────────────────────────────────
  // ETAPA 8: Generar salida vacía
  // ────────────────────────────────────────────────────────────────
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
      dominicalDiurno: 0,
      festivoDiurno: 0,
      dominicalNocturno: 0,
      festivoNocturno: 0,
      extraDominicalFestivoDiurno: 0,
      extraDominicalFestivoNocturno: 0,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // UTILIDADES: uso horario Bogotá
  // ────────────────────────────────────────────────────────────────
  private toBogotaDate(date: Date): Date {
    const BOGOTA_OFFSET = 300;
    const localOffset = date.getTimezoneOffset();
    return new Date(date.getTime() + (localOffset - BOGOTA_OFFSET) * 60000);
  }

  private normalizeDate(date: Date): string {
    const local = this.toBogotaDate(date);
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  }
}
