/**
 * Motor de Liquidación de Jornadas Laborales
 *
 * Clasifica cada minuto trabajado según la legislación colombiana vigente.
 * Basado en: CST Art. 158-179 + Ley 2466/2025 + Ley 2101/2021
 *
 * Modelo de 8 buckets mutuamente excluyentes.
 * Invariante: Σ(B1...B8) = liquidableMinutes (siempre).
 *
 * Flujo por minuto:
 * 1. Fecha/hora en Bogotá
 * 2. ¿Es domingo?
 * 3. ¿Es festivo?
 * 4. ¿Está en horario nocturno? (19:00-06:00)
 * 5. ¿Dentro del límite diario?
 * 6. ¿Dentro del límite semanal?
 * 7. Clasificar en bucket
 *
 * Descanso: 60 min fijos, se descuenta DESPUÉS de clasificar.
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
  classify(input: EngineInput): EngineOutput {
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
      return this.emptyOutput(0, 0);
    }

    // FASE 1: Descontar descanso ANTES de clasificar
    const effectiveBreak = Math.min(
      breakMinutes ?? DEFAULT_BREAK_MINUTES,
      totalMinutes,
    );
    const effectiveMinutes = totalMinutes - effectiveBreak;

    if (effectiveMinutes <= 0) {
      return this.emptyOutput(totalMinutes, effectiveBreak);
    }

    // FASE 2: Clasificar solo los minutos efectivos
    const capsMap = this.buildCapsMap(ordinaryDistributions);
    const holidaySet = new Set(holidays.map((d) => this.normalizeDate(d)));

    const output = this.emptyOutput(totalMinutes, effectiveBreak);

    let dailyUsed = 0;
    let weeklyUsed = accumulatedWeekMinutes;
    let prevDateStr = '';

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

      if (isOrdinary) {
        dailyUsed++;
        weeklyUsed++;
      }

      this.classifyMinute(output, isRestDay, isNight, isOrdinary);
    }

    output.liquidableMinutes = effectiveMinutes;

    return output;
  }

  /**
   * Clasifica un minuto en su bucket correspondiente.
   *
   * Árbol de decisiones:
   * isRestDay? → isNight? → isOrdinary? → bucket
   */
  private classifyMinute(
    output: EngineOutput,
    isRestDay: boolean,
    isNight: boolean,
    isOrdinary: boolean,
  ): void {
    if (isRestDay) {
      if (isOrdinary) {
        if (isNight) {
          output.dominicalFestivoNocturno++;
        } else {
          output.dominicalFestivoDiurno++;
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

  private buildCapsMap(
    distributions: OrdinaryDistributionInfo[],
  ): Record<number, number> {
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
