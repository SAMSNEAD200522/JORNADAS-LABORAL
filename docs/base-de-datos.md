# Base de datos

## Motor

PostgreSQL 16.

## Contenedor Docker

- Nombre del servicio: `postgres`
- Nombre del contenedor: `control-jornadas-db`
- Puerto: `5432`

## Configuración

| Variable       | Valor                      |
|----------------|----------------------------|
| Base de datos  | `control_jornadas`         |
| Usuario        | `app_user`                 |
| Puerto         | `5432`                     |
| Host (local)   | `localhost`                |
| Host (Docker)  | `postgres`                 |

> Nota: Las credenciales se definen en `docker-compose.yml` y en `backend/.env`.

## Persistencia

- Nombre del volumen: `pgdata`
- Tipo: volumen Docker administrado
- Ruta real: `/var/lib/docker/volumes/mi-proyecto_pgdata/_data` (Linux/Mac) o `\\wsl$\docker-desktop-data\version-pack-data\community\docker\volumes\` (Windows con WSL)

### Ciclo de vida

| Acción                          | ¿Los datos se conservan? |
|---------------------------------|--------------------------|
| `docker compose stop`           | Sí                       |
| `docker compose start`          | Sí                       |
| `docker compose down`           | Sí (el volumen persiste) |
| `docker compose down -v`        | **No** (elimina volumen) |
| `docker rm control-jornadas-db` | Sí (el volumen persiste) |
| Eliminar volumen manualmente    | No                       |

## Copia de seguridad

```bash
# Exportar
docker exec control-jornadas-db pg_dump -U app_user control_jornadas > respaldo_$(date +%Y%m%d).sql

# Restaurar
cat respaldo.sql | docker exec -i control-jornadas-db psql -U app_user control_jornadas
```

## Inspeccionar datos

### Opción 1: Prisma Studio (recomendada)

```bash
cd backend
npx prisma studio
```

Abre `http://localhost:5555` con interfaz gráfica para explorar y editar registros.

### Opción 2: psql (consola)

```bash
# Directo si PostgreSQL corre local
psql -h localhost -U app_user -d control_jornadas

# Via Docker
docker exec -it control-jornadas-db psql -U app_user control_jornadas
```

### Opción 3: API REST

Usar los endpoints existentes con autenticación JWT.

## Modelos

| Tabla (Prisma)     | Nombre BD     | Propósito                          |
|--------------------|---------------|-------------------------------------|
| `User`             | `usuarios`    | Usuarios del sistema (login/roles)  |
| `Employee`         | `empleados`   | Empleados cuyas jornadas se registran |
| `Schedule`         | `horarios`    | Horarios laborales                  |
| `WorkSession`      | `jornadas`    | Jornadas laborales registradas      |
| `Holiday`          | `festivos`    | Días festivos                       |
| `AuditLog`         | `auditoria`   | Registro de auditoría               |

## Notas

- Las contraseñas se almacenan hasheadas con bcrypt.
- Los tiempos se almacenan en **minutos enteros** en todos los campos numéricos de las jornadas.
- Las relaciones entre modelos usan foreign keys convencionales de PostgreSQL.
- No ejecutar `npx prisma migrate reset` ni `drop schema` en producción, pues elimina todos los datos.
