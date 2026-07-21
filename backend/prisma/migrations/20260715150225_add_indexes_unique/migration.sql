-- CreateIndex
CREATE UNIQUE INDEX "horarios_nombre_key" ON "horarios"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_trabajo_nombre_key" ON "configuracion_trabajo"("nombre");

-- CreateIndex
CREATE INDEX "jornadas_empleado_id_anulado_inicio_idx" ON "jornadas"("empleado_id", "anulado", "inicio");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- DropIndex (redundant)
DROP INDEX IF EXISTS "empleados_numero_documento_idx";
