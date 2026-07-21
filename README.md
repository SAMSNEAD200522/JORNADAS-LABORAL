# Control y Gestión de Jornadas Laborales (Colombia)

API REST para el control y clasificación de jornadas laborales según normativa colombiana.

## Stack

- **Backend**: NestJS + Prisma + PostgreSQL
- **Frontend**: HTML/CSS/JS vanilla (SPA)
- **Auth**: JWT con roles (ADMINISTRADOR, GESTION_HUMANA, CONSULTA)
- **Documentación**: Swagger en `/api/docs`

## Requisitos

- Node.js 22+
- PostgreSQL 16+
- pnpm o npm

## Inicio rápido

```bash
# 1. Clonar e instalar
cd backend
npm install

# 2. Configurar variables de entorno
cp .env .env   # editar según corresponda

# 3. Base de datos
npx prisma migrate dev
npx prisma db seed

# 4. Iniciar
npm run start:dev
```

La app corre en `http://localhost:3000` y la API en `http://localhost:3000/api/v1`.

## Docker

```bash
docker compose up -d
# Seed: docker compose exec backend npx prisma db seed
```

## Tests

```bash
cd backend
npm test           # tests unitarios
npm run test:e2e   # tests e2e
npm run test:cov   # cobertura
```

## API

| Método | Ruta                | Descripción             |
|--------|----------------------|-------------------------|
| POST   | /api/v1/auth/login   | Iniciar sesión          |
| GET    | /api/v1/empleados    | Listar empleados        |
| POST   | /api/v1/empleados    | Crear empleado          |
| GET    | /api/v1/horarios     | Listar horarios         |
| POST   | /api/v1/horarios     | Crear horario           |
| PATCH  | /api/v1/horarios/:id | Actualizar horario      |
| GET    | /api/v1/jornadas     | Listar jornadas         |
| POST   | /api/v1/jornadas     | Registrar jornada       |
| GET    | /api/v1/festivos     | Listar festivos         |
| POST   | /api/v1/festivos     | Registrar festivo       |
| GET    | /api/v1/reportes     | Reportes de nómina      |

Ver documentación completa en `http://localhost:3000/api/docs`.

## Roles

- `ADMINISTRADOR` — acceso completo
- `GESTION_HUMANA` — CRUD empleados/horarios/festivos
- `CONSULTA` — solo lectura

## Seed

```bash
# Crea usuarios, empleados, horarios, festivos, jornadas de ejemplo
npx prisma db seed
```

Usuario seed por defecto: `admin@empresa.com` / `admin123`.
