/**
 * Motor de Liquidación de Jornadas Laborales
 *
 * Basado en:
 * - Código Sustantivo del Trabajo (CST), Artículos 158-179
 * - Ley 2466 de 2025 (Reforma Laboral)
 * - Ley 2101 de 2021 (Reducción gradual jornada a 42h)
 *
 * Modelo de 8 buckets mutuamente excluyentes.
 * Cada minuto pertenece exactamente a UN bucket.
 * Σ(B1...B8) = totalMinutesLiquidables (siempre).
 */

export interface OrdinaryDistributionInfo {
  dayOfWeek: number;
  ordinaryMinutesCap: number;
}

export interface EngineInput {
  startTime: Date;
  endTime: Date;
  ordinaryDistributions: OrdinaryDistributionInfo[];
  holidays: Date[];
  workModality: 'ADMINISTRATIVO' | 'TERRITORIO';
  weeklyTargetMinutes: number;
  accumulatedWeekMinutes: number;
  breakMinutes: number;
  breakThresholdMinutes?: number | null;
}

/**
 * 8 buckets mutuamente excluyentes.
 * Cada bucket representa un concepto jurídico distinto del CST/Ley 2466.
 *
 * B1: Ordinario diurno (6:00-19:00, dentro de caps) → 100%
 * B2: Ordinario nocturno (19:00-6:00, dentro de caps) → 135%
 * B3: Extra diurno (6:00-19:00, fuera de caps) → 125%
 * B4: Extra nocturno (19:00-6:00, fuera de caps) → 175%
 * B5: Dominical/festivo diurno ordinario → 190%
 * B6: Dominical/festivo nocturno ordinario → 225%
 * B7: Extra dominical/festivo diurno → 215%
 * B8: Extra dominical/festivo nocturno → 265%
 */
export interface EngineOutput {
  totalMinutes: number;
  breakMinutes: number;
  liquidableMinutes: number;

  ordinarioDiurno: number;
  ordinarioNocturno: number;
  extraDiurno: number;
  extraNocturno: number;
  dominicalFestivoDiurno: number;
  dominicalFestivoNocturno: number;
  extraDominicalFestivoDiurno: number;
  extraDominicalFestivoNocturno: number;
}

export const TIMEZONE = 'America/Bogota';
