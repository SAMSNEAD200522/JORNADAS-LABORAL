# Usuarios del sistema vs Empleados

## Diferencia conceptual

| Característica       | Usuario del sistema                    | Empleado                              |
|----------------------|----------------------------------------|---------------------------------------|
| ¿Qué es?             | Persona que inicia sesión en la app    | Persona cuyas jornadas se registran   |
| ¿Tiene login?        | Sí                                      | No                                    |
| ¿Tiene rol/permisos? | Sí (ADMINISTRADOR, GESTION_HUMANA, SUPERVISOR) | No                          |
| ¿Se le registran jornadas? | No                               | Sí                                    |
| Almacenado en        | `usuarios` (User)                      | `empleados` (Employee)                |

## Tabla: usuarios (`usuarios`)

Modelo Prisma: `User`

```prisma
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String
  name          String
  role          Role      @default(SUPERVISOR)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  auditLogs     AuditLog[]
}
```

Campos:
- `email`: correo único usado para login
- `passwordHash`: hash bcrypt de la contraseña
- `role`: enum con ADMINISTRADOR, GESTION_HUMANA, SUPERVISOR

## Tabla: empleados (`empleados`)

Modelo Prisma: `Employee`

```prisma
model Employee {
  id              Int
  documentNumber  String  @unique
  firstName       String
  lastName        String
  position        String?
  area            String?
  scheduleId      Int?
  isActive        Boolean
  workSessions    WorkSession[]
}
```

## Relación

No existe relación directa entre `usuarios` y `empleados`.

Un usuario puede gestionar empleados sin ser él mismo un empleado registrado en el sistema.

## Consultar usuarios

```bash
# Prisma Studio
cd backend && npx prisma studio

# psql
docker exec -it control-jornadas-db psql -U app_user -d control_jornadas -c "SELECT id, email, name, role, \"isActive\" FROM usuarios;"
```

> Nunca ejecutes `SELECT passwordHash` en documentación o logs.

## Consultar empleados

```bash
# API
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/v1/empleados

# psql
docker exec -it control-jornadas-db psql -U app_user -d control_jornadas -c "SELECT id, numero_documento, nombres, apellidos, cargo, area, activo FROM empleados;"
```

## Crear un usuario de prueba (seguro)

```bash
# 1. Conectar a psql
docker exec -it control-jornadas-db psql -U app_user -d control_jornadas

# 2. Insertar (el hash es bcrypt de "test1234")
INSERT INTO usuarios (email, "passwordHash", name, role)
VALUES ('test@ejemplo.com', '$2b$10$EjemploHashQueDebeGenerarseConBcrypt', 'Test', 'CONSULTA');
```

Para generar un hash válido:

```bash
node -e "require('bcrypt').hash('test1234', 10).then(h => console.log(h))"
```

O usar el seed existente:

```bash
cd backend && npx prisma db seed
```

Que crea:
- `admin@empresa.com` / `admin123` → ADMINISTRADOR
- `rrhh@empresa.com` / `admin123` → GESTION_HUMANA
- `supervisor@empresa.com` / `admin123` → SUPERVISOR

## Verificar registros con Prisma Studio

```bash
cd backend
npx prisma studio
# Abre http://localhost:5555
# Explora las tablas: User, Employee, WorkSession, Schedule, Holiday, AuditLog
```
