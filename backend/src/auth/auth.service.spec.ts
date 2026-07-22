import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    blacklistedToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-access-token'),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    const validDto = { email: 'admin@empresa.com', password: 'admin123' };

    it('debe retornar token con credenciales válidas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'admin@empresa.com',
        passwordHash: 'hashed',
        name: 'Admin',
        role: 'ADMINISTRADOR',
        isActive: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(validDto);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user.role).toBe('ADMINISTRADOR');
      expect(result.user.email).toBe('admin@empresa.com');
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('debe rechazar email inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe lanzar código CREDENCIALES_INVALIDAS para email inexistente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      try {
        await service.login(validDto);
      } catch (e) {
        const response = (e as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('CREDENCIALES_INVALIDAS');
      }
    });

    it('debe rechazar usuario inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'admin@empresa.com',
        passwordHash: 'hashed',
        name: 'Admin',
        role: 'ADMINISTRADOR',
        isActive: false,
      });
      try {
        await service.login(validDto);
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        const response = (e as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('USUARIO_INACTIVO');
      }
    });

    it('debe rechazar contraseña incorrecta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'admin@empresa.com',
        passwordHash: 'hashed',
        name: 'Admin',
        role: 'ADMINISTRADOR',
        isActive: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      try {
        await service.login(validDto);
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        const response = (e as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('CREDENCIALES_INVALIDAS');
      }
    });

    it('debe retornar tokenType Bearer', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        passwordHash: 'h',
        name: 'A',
        role: 'SUPERVISOR',
        isActive: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result = await service.login(validDto);
      expect(result.tokenType).toBe('Bearer');
    });
  });

  describe('refresh', () => {
    const validPayload = { sub: 1, email: 'a@b.com', role: 'ADMINISTRADOR' };

    it('debe refrescar tokens exitosamente', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockReturnValue({
        ...validPayload,
        exp: 9999999999,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        name: 'A',
        role: 'ADMINISTRADOR',
        isActive: true,
      });
      mockPrisma.blacklistedToken.create.mockResolvedValue({});
      mockJwtService.sign.mockReturnValue('new-token');

      const result = await service.refresh('old-refresh-token');
      expect(result).toHaveProperty('accessToken', 'new-token');
      expect(result).toHaveProperty('refreshToken', 'new-token');
      expect(mockPrisma.blacklistedToken.create).toHaveBeenCalled();
    });

    it('debe rechazar token en lista negra', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue({
        id: 1,
        token: 'revoked',
        expiresAt: new Date(),
      });
      await expect(service.refresh('revoked')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe lanzar TOKEN_INVALIDO cuando el token está en lista negra', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue({
        id: 1,
        token: 'x',
        expiresAt: new Date(),
      });
      try {
        await service.refresh('revoked');
      } catch (e) {
        const response = (e as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('TOKEN_INVALIDO');
      }
    });

    it('debe rechazar token JWT inválido o expirado', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe rechazar refresh si el usuario ya no existe', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockReturnValue({
        sub: 999,
        email: 'x@x.com',
        role: 'SUPERVISOR',
        exp: 9999999999,
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.refresh('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe rechazar refresh si el usuario está inactivo', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockReturnValue({
        sub: 1,
        email: 'x@x.com',
        role: 'SUPERVISOR',
        exp: 9999999999,
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, isActive: false });
      await expect(service.refresh('token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debe blacklishear el token viejo antes de emitir nuevos', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockReturnValue({
        sub: 1,
        email: 'a@b.com',
        role: 'ADMINISTRADOR',
        exp: 9999999999,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'a@b.com',
        name: 'A',
        role: 'ADMINISTRADOR',
        isActive: true,
      });
      mockPrisma.blacklistedToken.create.mockResolvedValue({});
      mockJwtService.sign.mockReturnValue('new');

      await service.refresh('old-token');
      expect(mockPrisma.blacklistedToken.create).toHaveBeenCalledWith({
        data: { token: 'old-token', expiresAt: expect.any(Date) },
      });
    });
  });

  describe('logout', () => {
    it('debe blacklishear el token', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockReturnValue({ exp: 9999999999 });
      mockPrisma.blacklistedToken.create.mockResolvedValue({});

      const result = await service.logout('my-token');
      expect(result).toHaveProperty('message', 'Sesión cerrada exitosamente');
      expect(mockPrisma.blacklistedToken.create).toHaveBeenCalled();
    });

    it('debe manejar token ya blacklisteado sin error', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue({
        id: 1,
        token: 'x',
        expiresAt: new Date(),
      });
      const result = await service.logout('my-token');
      expect(result).toHaveProperty('message');
      expect(mockPrisma.blacklistedToken.create).not.toHaveBeenCalled();
    });
  });

  describe('isTokenBlacklisted', () => {
    it('debe retornar true si el token está en la BD', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue({ id: 1 });
      const result = await service.isTokenBlacklisted('token');
      expect(result).toBe(true);
    });

    it('debe retornar false si el token no está en la BD', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      const result = await service.isTokenBlacklisted('token');
      expect(result).toBe(false);
    });
  });

  describe('blacklistToken (private)', () => {
    it('debe crear registro con expiresAt basado en el payload JWT', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockReturnValue({ exp: 1700000000 });
      mockPrisma.blacklistedToken.create.mockResolvedValue({});

      await service.logout('tok');
      expect(mockPrisma.blacklistedToken.create).toHaveBeenCalledWith({
        data: { token: 'tok', expiresAt: new Date(1700000000 * 1000) },
      });
    });

    it('debe usar 7 días como fallback si verify falla', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('bad');
      });
      mockPrisma.blacklistedToken.create.mockResolvedValue({});

      const before = Date.now();
      await service.logout('tok');
      const call = mockPrisma.blacklistedToken.create.mock.calls[0][0];
      const expiresAt = call.data.expiresAt.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(
        before + 7 * 24 * 60 * 60 * 1000 - 1000,
      );
      expect(expiresAt).toBeLessThanOrEqual(
        before + 7 * 24 * 60 * 60 * 1000 + 1000,
      );
    });

    it('no debe duplicar si el token ya existe en la BD', async () => {
      mockPrisma.blacklistedToken.findUnique.mockResolvedValue({ id: 5 });
      mockPrisma.blacklistedToken.create.mockResolvedValue({});

      await service.logout('tok');
      expect(mockPrisma.blacklistedToken.create).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('debe eliminar tokens expirados y retornar la cantidad', async () => {
      mockPrisma.blacklistedToken.deleteMany.mockResolvedValue({ count: 3 });
      const result = await service.cleanupExpiredTokens();
      expect(result).toBe(3);
      expect(mockPrisma.blacklistedToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('debe retornar 0 si no hay tokens expirados', async () => {
      mockPrisma.blacklistedToken.deleteMany.mockResolvedValue({ count: 0 });
      const result = await service.cleanupExpiredTokens();
      expect(result).toBe(0);
    });
  });
});
