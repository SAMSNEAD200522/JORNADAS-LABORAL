-- CreateIndex
CREATE INDEX "auditoria_createdAt_idx" ON "auditoria"("createdAt");

-- CreateIndex
CREATE INDEX "jornadas_empleado_id_inicio_idx" ON "jornadas"("empleado_id", "inicio");
