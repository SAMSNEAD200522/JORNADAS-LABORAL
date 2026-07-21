-- DropIndex (redundant: covered by [employeeId, startTime] and [employeeId, isVoided, startTime])
DROP INDEX IF EXISTS "jornadas_empleado_id_idx";
