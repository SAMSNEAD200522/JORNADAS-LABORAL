# Manual de Administración — Sistema de Control y Gestión de Jornadas Laborales

## 1. Acceso al Sistema

### 1.1 Credenciales por defecto (seed)

| Email | Contraseña | Rol |
|---|---|---|
| admin@empresa.com | admin123 | ADMINISTRADOR |
| rrhh@empresa.com | admin123 | GESTION_HUMANA |
| supervisor@empresa.com | admin123 | SUPERVISOR |

> **IMPORTANTE:** Cambiar las contraseñas por defecto después del primer ingreso.

### 1.2 Login

- URL: `http://localhost:3001`
- Ingresar email y contraseña
- Sesión válida por 24 horas (JWT)

---

## 2. Roles y Permisos

| Rol | Empleados | Config. Laboral | Jornadas | Festivos | Reportes | Histórico | Usuarios |
|---|---|---|---|---|---|---|---|
| ADMINISTRADOR | CRUD | CRUD | CRUD | CRUD | Ver | Ver | CRUD |
| GESTION_HUMANA | CRUD | CRUD | CRUD | CRUD | Ver | Ver | — |
| SUPERVISOR | Solo lectura | — | CRUD | Ver | Ver | Ver | — |

---

## 3. Gestión de Usuarios

Solo el rol **ADMINISTRADOR** puede gestionar usuarios.

### 3.1 Crear usuario

1. Ir a **Usuarios** en el menú lateral
2. Click en **"+ Nuevo"**
3. Completar: Nombre, Email, Contraseña (mínimo 6 caracteres), Rol
4. Click en **Guardar**

### 3.2 Editar usuario

1. En la tabla de usuarios, click en **"Editar"** del usuario deseado
2. Modificar campos necesarios (contraseña opcional — dejar vacío para no cambiar)
3. Click en **Guardar**

### 3.3 Activar/Desactivar usuario

- Click en **"Desactivar"** o **"Activar"** en la columna Acciones
- Un usuario desactivado no puede iniciar sesión

### 3.4 Restablecer contraseña

1. Click en **"Contraseña"** en la columna Acciones
2. Ingresar nueva contraseña (mínimo 6 caracteres)
3. Click en **"Restablecer"**

### 3.5 Filtros de búsqueda

- Buscar por nombre o email
- Filtrar por estado (Activos/Inactivos)
- Filtrar por rol

---

## 4. Gestión de Empleados

### 4.1 Crear empleado

1. Ir a **Empleados** → **"+ Nuevo"**
2. Completar campos obligatorios:
   - Tipo de documento (CC, CE, Pasaporte)
   - Número de documento
   - Nombres y Apellidos
3. Campos opcionales: Email, Teléfono, Cargo, Área, Configuración laboral, Modalidad, Minutos semanales

### 4.2 Editar empleado

- Click en **"Editar"** → Modificar → **Guardar**

### 4.3 Activar/Desactivar

- Click en **"Activar"** o **"Desactivar"**

---

## 5. Configuración Laboral

### 5.1 Crear configuración

1. Ir a **Config. laboral** → **"+ Nueva"**
2. Completar:
   - Nombre (ej: "Administrativo", "Territorio")
   - Modalidad (Administrativo / Territorio)
   - Descanso fijo: 60 minutos (regla institucional)
   - Umbral descanso (solo Territorio): 480 min
   - Meta semanal: 2520 min (42 horas)

### 5.2 Distribución ordinaria

Click en **"Distribución"** para definir el tope de minutos ordinarios por día:

| Día | Ejemplo Admin | Ejemplo Territorio |
|---|---|---|
| Lunes | 540 min (9h) | 420 min (7h) |
| Martes | 540 min (9h) | 420 min (7h) |
| Miércoles | 480 min (8h) | 420 min (7h) |
| Jueves | 480 min (8h) | 420 min (7h) |
| Viernes | 480 min (8h) | 420 min (7h) |
| Sábado | 0 min | 420 min (7h) |
| Domingo | 0 min | 420 min (7h) |

> Un valor de 0 significa que todo el trabajo ese día es extra.

---

## 6. Jornadas Laborales

### 6.1 Crear jornada

1. Ir a **Jornadas** → **"+ Nueva"**
2. Seleccionar empleado (buscar por nombre o cédula)
3. Seleccionar fecha/hora de inicio y fin
4. Click en **Guardar**
5. El sistema clasifica automáticamente en 8 categorías

### 6.2 Clasificación automática (8 buckets)

| Bucket | Descripción | Recargo |
|---|---|---|
| B1 | Ordinaria diurna (día hábil) | 100% |
| B2 | Ordinaria nocturna (19:00–06:00) | 135% |
| B3 | Extra diurna (día hábil) | 125% |
| B4 | Extra nocturna (día hábil) | 162.5% |
| B5 | Dominical/festiva diurna | 175% |
| B6 | Dominical/festiva nocturna | 237.5% |
| B7 | Extra festiva diurna | 200% |
| B8 | Extra festiva nocturna | 275% |

### 6.3 Anular jornada

1. Click en **"Anular"** en la columna Acciones
2. Ingresar motivo de anulación (obligatorio)
3. Confirmar

> Las jornadas anuladas aparecen en rojo pero no se liquidan.

### 6.4 Decisión compensatoria

Click en **"Comp."** para asignar tipo compensatorio:
- **Compensar con descanso** (CON_COMPENSATORIO)
- **Pago dominical/festivo** (SIN_COMPENSATORIO)
- **Pendiente definición** (PENDIENTE_DEFINICION)
- **No aplica** (NO_APLICA)

---

## 7. Histórico por Empleado

1. Ir a **Histórico**
2. Seleccionar empleado
3. Seleccionar período: Semanal, Mensual o Rango
4. Click en **"Consultar"**
5. Ver resumen de horas y desglose diario
6. Click en **"Excel"** para exportar (requiere rango de fechas)

---

## 8. Festivos

### 8.1 Crear festivo

1. Ir a **Festivos** → **"+ Nuevo"**
2. Seleccionar fecha y nombre
3. **Guardar**

### 8.2 Eliminar festivo

- Click en **"Eliminar"** → Confirmar

> Los festivos del 2026 ya están pre-cargados en el seed.

---

## 9. Reportes

### 9.1 Generar reporte

1. Ir a **Reportes**
2. Seleccionar empleado (opcional — "Todos" por defecto)
3. Seleccionar período:
   - **Semanal:** Año + número de semana
   - **Mensual:** Año + número de mes
   - **Rango:** Fecha inicio y fin
4. Click en **"Generar reporte"**

### 9.2 Exportar a Excel

- Click en **"Excel"** en el encabezado del reporte

---

## 10. Datos de Prueba (Seed)

### Empleados pre-cargados

| Nombre | Documento | Cargo | Área | Modalidad |
|---|---|---|---|---|
| Carlos Andrés Ramírez Pérez | 1000000001 | Analista Senior | Tecnología | Administrativo |
| María García Torres | 1000000002 | Asesora Comercial | Ventas | Territorio |
| Pedro López Martínez | 1000000003 | Vigilante | Seguridad | Administrativo |

### Configuraciones laborales

| Nombre | Modalidad | Descanso | Meta Semanal |
|---|---|---|---|
| Administrativo | ADMINISTRATIVO | 60 min | 2520 min (42h) |
| Territorio | TERRITORIO | 60 min (≥480 min) | 2520 min (42h) |

### Festivos 2026 (18 días)

Año Nuevo, Reyes Magos, San José, Jueves Santo, Viernes Santo, Día del Trabajo, Ascensión, Corpus Christi, Sagrado Corazón, San Pedro y San Pablo, Independencia, Batalla de Boyacá, Asunción Virgen, Día de la Raza, Todos los Santos, Independencia Cartagena, Inmaculada Concepción, Navidad.

---

## 11. Base de Datos (Prisma Studio)

Para inspeccionar la base de datos directamente:

```bash
cd backend
npx prisma studio
```

Se abrirá en `http://localhost:5555`.

---

## 12. Endpoints de la API

### Autenticación

| Método | Endpoint | Descripción | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Iniciar sesión | No |

### Usuarios (Solo ADMINISTRADOR)

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/v1/usuarios` | Crear usuario |
| GET | `/api/v1/usuarios` | Listar (paginado, filtros) |
| GET | `/api/v1/usuarios/stats` | Estadísticas |
| GET | `/api/v1/usuarios/:id` | Obtener usuario |
| PATCH | `/api/v1/usuarios/:id` | Actualizar usuario |
| PATCH | `/api/v1/usuarios/:id/estado` | Activar/Desactivar |
| PATCH | `/api/v1/usuarios/:id/restablecer-contraseña` | Restablecer contraseña |

### Empleados

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/v1/empleados` | Crear empleado |
| GET | `/api/v1/empleados` | Listar (paginado, filtros) |
| GET | `/api/v1/empleados/:id` | Obtener empleado |
| PATCH | `/api/v1/empleados/:id` | Actualizar empleado |
| PATCH | `/api/v1/empleados/:id/estado` | Activar/Desactivar |

### Configuración Laboral

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/v1/configuracion-laboral` | Crear configuración |
| GET | `/api/v1/configuracion-laboral` | Listar |
| GET | `/api/v1/configuracion-laboral/:id` | Obtener |
| PATCH | `/api/v1/configuracion-laboral/:id` | Actualizar |
| PATCH | `/api/v1/configuracion-laboral/:id/estado` | Activar/Desactivar |
| POST | `/api/v1/configuracion-laboral/:id/distribucion` | Guardar distribución |
| GET | `/api/v1/configuracion-laboral/:id/distribucion` | Obtener distribución |

### Jornadas

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/v1/jornadas` | Crear jornada |
| GET | `/api/v1/jornadas` | Listar (paginado, filtros) |
| GET | `/api/v1/jornadas/:id` | Obtener jornada |
| PATCH | `/api/v1/jornadas/:id` | Actualizar jornada |
| PATCH | `/api/v1/jornadas/:id/anular` | Anular jornada |
| PATCH | `/api/v1/jornadas/:id/compensatorio` | Decisión compensatoria |

### Festivos

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/v1/festivos` | Crear festivo |
| GET | `/api/v1/festivos` | Listar |
| DELETE | `/api/v1/festivos/:id` | Eliminar |

### Reportes

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/v1/reportes/semanal` | Reporte semanal |
| GET | `/api/v1/reportes/mensual` | Reporte mensual |
| GET | `/api/v1/reportes/rango` | Reporte por rango |

### Auditoría

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/v1/auditoria` | Consultar logs |

### Swagger (Documentación interactiva)

Disponible en: `http://localhost:3000/api/docs`

---

## 13. Parámetros Legales Vigentes

| Concepto | Valor | Fuente |
|---|---|---|
| Jornada máxima diaria | 8 horas (480 min) | Art. 161 CST |
| Jornada máxima semanal | 42 horas (2520 min) | Ley 2101, vigente 15 jul 2026 |
| Horas extras diarias | Máximo 2 horas (120 min) | Art. 159 CST |
| Horas extras semanales | Máximo 12 horas (720 min) | Art. 159 CST |
| Horario nocturno | 19:00 – 06:00 | Art. 160 CST (Ley 2466) |
| Recargo nocturno | 35% | Art. 168.4 CST |
| Recargo dominical/festivo | 90% | Art. 179 CST (Ley 2466) |
| Descanso obligatorio | 60 minutos fijo | Regla institucional |
