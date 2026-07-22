import { EngineOutput } from '../labor-engine/labor-engine.types';

export interface AuditTrace {
  generalInfo: GeneralInfo;
  inputData: InputData;
  configUsed: ConfigUsed;
  breakApplication: BreakApplication;
  timeline: MinuteClassification[];
  legalClassification: LegalClassification;
  weeklyAccumulation: WeeklyAccumulation;
  finalResult: EngineOutput;
  validations: Validation[];
  generatedAt: string;
}

export interface GeneralInfo {
  employeeId: number;
  employeeName: string;
  documentNumber: string;
  modality: string;
  configName: string;
  territoryConfig: Record<string, number>;
  weeklyTargetMinutes: number;
  timezone: string;
  startTime: string;
  endTime: string;
}

export interface InputData {
  startTime: string;
  endTime: string;
  totalMinutes: number;
  breakMinutesInput: number;
}

export interface ConfigUsed {
  dailyCaps: Record<string, number>;
  weeklyTargetMinutes: number;
  accumulatedWeekMinutes: number;
  breakMinutes: number;
  nightStart: string;
  nightEnd: string;
  recargos: Record<string, number>;
}

export interface BreakApplication {
  totalMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  reasoning: string;
}

export interface MinuteClassification {
  minuteIndex: number;
  absoluteTime: string;
  bogotaTime: string;
  hour: number;
  dayOfWeek: number;
  dayName: string;
  dateStr: string;
  isNight: boolean;
  isSunday: boolean;
  isHoliday: boolean;
  isRestDay: boolean;
  isWithinDaily: boolean;
  isWithinWeekly: boolean;
  isOrdinary: boolean;
  dailyUsedBefore: number;
  dailyCap: number;
  weeklyUsedBefore: number;
  bucket: string;
}

export interface LegalClassification {
  buckets: BucketDetail[];
  totalLiquidable: number;
  invariants: {
    sumOfBuckets: number;
    equalsLiquidable: boolean;
    noDoubleCounting: boolean;
  };
}

export interface BucketDetail {
  name: string;
  key: string;
  minutes: number;
  percentage: number;
  legalBase: string;
  description: string;
}

export interface WeeklyAccumulation {
  beforeMinutes: number;
  afterMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
}

export interface Validation {
  name: string;
  passed: boolean;
  detail: string;
}
