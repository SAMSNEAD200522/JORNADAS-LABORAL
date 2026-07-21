-- CreateTable
CREATE TABLE "usuarios" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPERVISOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "empleados" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo_documento" TEXT NOT NULL DEFAULT 'CC',
    "numero_documento" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "cargo" TEXT,
    "area" TEXT,
    "fecha_ingreso" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "horario_id" INTEGER,
    "configuracion_trabajo_id" INTEGER,
    "modalidad_laboral" TEXT NOT NULL DEFAULT 'ADMINISTRATIVO',
    "minutos_semanales_objetivo" INTEGER NOT NULL DEFAULT 2520,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "empleados_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "empleados_configuracion_trabajo_id_fkey" FOREIGN KEY ("configuracion_trabajo_id") REFERENCES "configuracion_trabajo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "horarios" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "hora_entrada" TEXT NOT NULL,
    "hora_salida" TEXT NOT NULL,
    "dias_laborales" TEXT NOT NULL,
    "descanso_minutos" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "horarios_diarios" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "horario_id" INTEGER NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_entrada" TEXT NOT NULL,
    "hora_salida" TEXT NOT NULL,
    "descanso_minutos" INTEGER,
    CONSTRAINT "horarios_diarios_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "configuracion_trabajo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "modalidad" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "descanso_minutos" INTEGER NOT NULL DEFAULT 60,
    "minutos_para_descanso" INTEGER,
    "minutos_semanales_objetivo" INTEGER NOT NULL DEFAULT 2520,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "distribucion_ordinaria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "configuracion_id" INTEGER NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "tope_minutos_ordinarios" INTEGER NOT NULL,
    CONSTRAINT "distribucion_ordinaria_configuracion_id_fkey" FOREIGN KEY ("configuracion_id") REFERENCES "configuracion_trabajo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "configuracion_global" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inicio_nocturno" TEXT NOT NULL DEFAULT '21:00',
    "fin_nocturno" TEXT NOT NULL DEFAULT '06:00',
    "descanso_por_defecto" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "jornadas" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "empleado_id" INTEGER NOT NULL,
    "inicio" DATETIME NOT NULL,
    "fin" DATETIME NOT NULL,
    "total_minutos" INTEGER,
    "minutos_ordinarios" INTEGER,
    "minutos_recargo_nocturno" INTEGER,
    "minutos_extra_diurna" INTEGER,
    "minutos_extra_nocturna" INTEGER,
    "minutos_dominical" INTEGER,
    "minutos_festivo" INTEGER,
    "minutos_extra_festiva_diurna" INTEGER,
    "minutos_extra_festiva_nocturna" INTEGER,
    "minutos_recargo_nocturno_dominical_festivo" INTEGER,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_anulacion" DATETIME,
    "motivo_anulacion" TEXT,
    "dia_descanso_trabajado" BOOLEAN NOT NULL DEFAULT false,
    "tipo_compensatorio" TEXT NOT NULL DEFAULT 'NO_APLICA',
    "usuario_decision_compensatorio" INTEGER,
    "fecha_decision_compensatorio" DATETIME,
    "horas_compensatorio" INTEGER,
    "observacion_compensatorio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "jornadas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "jornadas_usuario_decision_compensatorio_fkey" FOREIGN KEY ("usuario_decision_compensatorio") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "festivos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fecha" DATETIME NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuario_id" INTEGER,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" INTEGER,
    "valores_anteriores" JSONB,
    "valores_nuevos" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_numero_documento_key" ON "empleados"("numero_documento");

-- CreateIndex
CREATE INDEX "empleados_numero_documento_idx" ON "empleados"("numero_documento");

-- CreateIndex
CREATE INDEX "empleados_apellidos_idx" ON "empleados"("apellidos");

-- CreateIndex
CREATE INDEX "empleados_activo_idx" ON "empleados"("activo");

-- CreateIndex
CREATE INDEX "empleados_area_idx" ON "empleados"("area");

-- CreateIndex
CREATE UNIQUE INDEX "horarios_diarios_horario_id_dia_semana_key" ON "horarios_diarios"("horario_id", "dia_semana");

-- CreateIndex
CREATE UNIQUE INDEX "distribucion_ordinaria_configuracion_id_dia_semana_key" ON "distribucion_ordinaria"("configuracion_id", "dia_semana");

-- CreateIndex
CREATE INDEX "jornadas_empleado_id_idx" ON "jornadas"("empleado_id");

-- CreateIndex
CREATE INDEX "jornadas_inicio_idx" ON "jornadas"("inicio");

-- CreateIndex
CREATE INDEX "jornadas_fin_idx" ON "jornadas"("fin");

-- CreateIndex
CREATE UNIQUE INDEX "festivos_fecha_key" ON "festivos"("fecha");

-- CreateIndex
CREATE INDEX "auditoria_entidad_idx" ON "auditoria"("entidad");

-- CreateIndex
CREATE INDEX "auditoria_entidad_id_idx" ON "auditoria"("entidad_id");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");
