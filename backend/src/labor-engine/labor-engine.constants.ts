/**
 * Constantes del Motor de Liquidación
 *
 * Basadas en la legislación laboral colombiana vigente:
 * - Código Sustantivo del Trabajo (CST)
 * - Ley 2466 de 2025 (Reforma Laboral) - Art. 10 modifica Art. 160 CST
 * - Ley 2101 de 2021 (Reducción jornada a 42h)
 *
 * Fecha de vigencia: Julio 2026
 */

// ─── Horarios (Art. 160 CST, modificado por Ley 2466 Art. 10) ─────
// Trabajo diurno: 6:00 a.m. a 7:00 p.m. (19:00)
// Trabajo nocturno: 7:00 p.m. (19:00) a 6:00 a.m.
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 19;
export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 6;

export const DAY_START = DAY_START_HOUR * 60; // 360 min
export const NIGHT_START = NIGHT_START_HOUR * 60; // 1140 min
export const NIGHT_END = NIGHT_END_HOUR * 60; // 360 min

// ─── Jornada (Art. 161 CST + Ley 2101) ────────────────────────────
// Desde julio 2026: 42h semanales, 8h diarias máximas
export const DAILY_MAX_MINUTES = 480; // 8h × 60
export const WEEKLY_TARGET_MINUTES = 2520; // 42h × 60

// ─── Horas Extra (Art. 159 CST + Art. 162) ────────────────────────
// Máximo 2h/día, 12h/semana
export const EXTRA_DAILY_MAX = 120; // 2h × 60
export const EXTRA_WEEKLY_MAX = 720; // 12h × 60

// ─── Descanso (Regla institucional fija) ──────────────────────────
export const DEFAULT_BREAK_MINUTES = 60;

// ─── Recargos (Art. 168 CST) ──────────────────────────────────────
// Recargo nocturno ordinario: 35% (Art. 168.1)
export const RECARGO_NOCTURNO = 0.35;

// Hora extra diurna: 25% (Art. 168.2)
export const RECARGO_EXTRA_DIURNO = 0.25;

// Hora extra nocturna: 75% (Art. 168.3) - NO acumula con recargo nocturno 35%
export const RECARGO_EXTRA_NOCTURNO = 0.75;

// ─── Recargo dominical/festivo (Art. 179 CST + Ley 2466 Art. 14) ──
// Antes jul 2025: 75%, Jul 2025-jun 2026: 80%, Jul 2026-jun 2027: 90%, Jul 2027+: 100%
export const RECARGO_DOMINICAL = 0.9; // Vigente julio 2026

// ─── Porcentajes totales por bucket (% sobre hora ordinaria) ──────
export const BUCKET_PERCENTAGES = {
  ordinarioDiurno: 1.0, // 100%
  ordinarioNocturno: 1.35, // 100% + 35%
  extraDiurno: 1.25, // 100% + 25%
  extraNocturno: 1.75, // 100% + 75%
  dominicalDiurno: 1.9, // 100% + 90%
  festivoDiurno: 1.9, // 100% + 90%
  dominicalNocturno: 2.25, // 100% + 90% + 35%
  festivoNocturno: 2.25, // 100% + 90% + 35%
  extraDominicalFestivoDiurno: 2.15, // 100% + 90% + 25%
  extraDominicalFestivoNocturno: 2.65, // 100% + 90% + 75%
} as const;

export const MINUTES_PER_DAY = 24 * 60;
