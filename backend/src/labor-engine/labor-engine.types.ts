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
 * 10 buckets mutuamente excluyentes.
 * Cada bucket representa un concepto jurídico distinto del CST/Ley 2466.
 *
 * B1: Ordinario diurno (6:00-19:00, dentro de caps) → 100%
 * B2: Ordinario nocturno (19:00-6:00, dentro de caps) → 135%
 * B3: Extra diurno (6:00-19:00, fuera de caps) → 125%
 * B4: Extra nocturno (19:00-6:00, fuera de caps) → 175%
 * B5a: Dominical diurno ordinario → 190%
 * B5b: Festivo diurno ordinario → 190%
 * B6a: Dominical nocturno ordinario → 225% (REC.NDF dominical)
 * B6b: Festivo nocturno ordinario → 225% (REC.NDF festivo)
 * B7: Extra dominical/festivo diurno → 215%
 * B8: Extra dominical/festivo nocturno → 265%
 *
 * Payroll codes:
 * 001        → B1
 * 002-HED    → B3
 * 003-HEN    → B4
 * 004-HEFD   → B7
 * 005-HEFN   → B8
 * 006-RECNOC → B2
 * 012-REC.NDF→ B6a + B6b
 * 013-DOMINGO→ B5a
 * 014-FESTIVO→ B5b
 */
export interface EngineOutput {
  totalMinutes: number;
  breakMinutes: number;
  liquidableMinutes: number;

  ordinarioDiurno: number;           // B1 → 001
  ordinarioNocturno: number;         // B2 → 006-RECNOC
  extraDiurno: number;               // B3 → 002-HED
  extraNocturno: number;             // B4 → 003-HEN
  dominicalDiurno: number;           // B5a → 013-DOMINGO
  festivoDiurno: number;             // B5b → 014-FESTIVO
  dominicalNocturno: number;         // B6a → REC.NDF dominical
  festivoNocturno: number;           // B6b → REC.NDF festivo
  extraDominicalFestivoDiurno: number;  // B7 → 004-HEFD
  extraDominicalFestivoNocturno: number;// B8 → 005-HEFN
}

export const TIMEZONE = 'America/Bogota';
