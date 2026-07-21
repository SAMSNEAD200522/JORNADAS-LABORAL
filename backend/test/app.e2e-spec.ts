import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

describe('API E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let supervisorToken: string;
  let createdSessionId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('/api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    try {
      if (createdSessionId) {
        await request(app.getHttpServer())
          .patch(`/api/v1/jornadas/${createdSessionId}/anular`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ reason: 'Limpieza E2E' });
      }
    } catch { /* ya anulada en test, ignorar */ }
    await app.close();
  });

  // ── 1. Health ─────────────────────────────────────────────
  describe('GET /api/v1/health', () => {
    it('debe retornar OK con DB conectada', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.estado).toBe('OK');
          expect(res.body.baseDeDatos).toBe('conectada');
        });
    });
  });

  // ── 2. Auth ───────────────────────────────────────────────
  describe('POST /api/v1/auth/login', () => {
    it('debe autenticar admin y retornar token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@empresa.com', password: 'admin123' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body.user.role).toBe('ADMINISTRADOR');
          adminToken = res.body.accessToken;
        });
    });

    it('debe autenticar supervisor y retornar token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'supervisor@empresa.com', password: 'admin123' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body.user.role).toBe('SUPERVISOR');
          supervisorToken = res.body.accessToken;
        });
    });

    it('debe rechazar credenciales inválidas', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@empresa.com', password: 'wrong' })
        .expect(401);
    });
  });

  // ── 3. Roles ──────────────────────────────────────────────
  describe('Role guards', () => {
    it('supervisor NO debe poder crear empleado (403)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/empleados')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ documentType: 'CC', documentNumber: 'E2E-TEST', firstName: 'Test', lastName: 'User' })
        .expect(403);
    });

    it('supervisor NO debe poder crear horario (403)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/horarios')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({ name: 'Test', startTime: '07:00', endTime: '17:00', workDays: '1,2,3,4,5' })
        .expect(403);
    });

    it('usuario no autenticado recibe 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/empleados')
        .expect(401);
    });
  });

  // ── 4. Empleados ──────────────────────────────────────────
  describe('Empleados', () => {
    it('debe listar empleados paginados', () => {
      return request(app.getHttpServer())
        .get('/api/v1/empleados?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
          expect(res.body.meta.total).toBeGreaterThan(0);
        });
    });

    it('debe buscar empleado por nombre', () => {
      return request(app.getHttpServer())
        .get('/api/v1/empleados?search=Carlos')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeGreaterThan(0);
        });
    });

    it('debe rechazar crear empleado con datos inválidos', () => {
      return request(app.getHttpServer())
        .post('/api/v1/empleados')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ documentType: 'INVALIDO' })
        .expect(400);
    });
  });

  // ── 5. Jornadas CRUD ─────────────────────────────────────
  describe('Jornadas CRUD', () => {
    const startTime = '2026-07-08T07:00:00.000Z';
    const endTime = '2026-07-08T17:00:00.000Z';

    it('debe crear una jornada', () => {
      return request(app.getHttpServer())
        .post('/api/v1/jornadas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ employeeId: 1, startTime, endTime })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('totalMinutes');
          expect(res.body.totalMinutes).toBeGreaterThan(0);
          createdSessionId = res.body.id;
        });
    });

    it('debe listar jornadas', () => {
      return request(app.getHttpServer())
        .get('/api/v1/jornadas?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
        });
    });

    it('debe obtener una jornada por ID', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/jornadas/${createdSessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(createdSessionId);
          expect(res.body).toHaveProperty('employee');
        });
    });

    it('debe actualizar una jornada', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/jornadas/${createdSessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime, endTime })
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(createdSessionId);
          expect(res.body.totalMinutes).toBeGreaterThan(0);
        });
    });

    it('debe anular una jornada', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/jornadas/${createdSessionId}/anular`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Error de registro' })
        .expect(200)
        .expect((res) => {
          expect(res.body.isVoided).toBe(true);
          expect(res.body.voidedReason).toBe('Error de registro');
        });
    });

    it('debe rechazar anular jornada ya anulada', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/jornadas/${createdSessionId}/anular`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Doble anulación' })
        .expect(409);
    });

    it('debe rechazar actualizar jornada anulada', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/jornadas/${createdSessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ startTime, endTime })
        .expect(400);
    });

      it('debe crear jornada validando start/end', () => {
      return request(app.getHttpServer())
        .post('/api/v1/jornadas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ employeeId: 1, startTime: '2026-07-08T17:00:00.000Z', endTime: '2026-07-08T07:00:00.000Z' })
        .expect(400);
    });
  });

  // ── 6. Reportes ───────────────────────────────────────────
  describe('Reportes', () => {
    it('debe generar reporte semanal', () => {
      return request(app.getHttpServer())
        .get('/api/v1/reportes/semanal?year=2026&week=28')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('periodo');
          expect(res.body).toHaveProperty('totalHoras');
        });
    });

    it('debe generar reporte mensual con employeeId', () => {
      return request(app.getHttpServer())
        .get('/api/v1/reportes/mensual?year=2026&month=7&employeeId=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.length).toBeGreaterThanOrEqual(0);
        });
    });

    it('debe generar reporte por rango', () => {
      return request(app.getHttpServer())
        .get('/api/v1/reportes/rango?startDate=2026-07-01&endDate=2026-07-31')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ── 7. Horarios ───────────────────────────────────────────
  describe('Horarios', () => {
    it('debe listar horarios', () => {
      return request(app.getHttpServer())
        .get('/api/v1/horarios')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  // ── 8. Festivos ───────────────────────────────────────────
  describe('Festivos', () => {
    it('debe listar festivos', () => {
      return request(app.getHttpServer())
        .get('/api/v1/festivos')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });
});
