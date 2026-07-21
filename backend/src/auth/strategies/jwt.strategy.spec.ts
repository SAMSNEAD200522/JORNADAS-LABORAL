import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockAuthService = {
    isTokenBlacklisted: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(mockPrisma as any, mockAuthService as any);
  });

  const mockRequest = (token = 'valid-token') => ({
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = { sub: 1, email: 'admin@empresa.com', role: 'ADMINISTRADOR' };

  it('debe retornar el usuario cuando el token es válido y está activo', async () => {
    mockAuthService.isTokenBlacklisted.mockResolvedValue(false);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@empresa.com',
      name: 'Admin',
      role: 'ADMINISTRADOR',
      isActive: true,
    });

    const result = await strategy.validate(mockRequest() as any, payload);

    expect(result).toEqual({
      id: 1,
      email: 'admin@empresa.com',
      name: 'Admin',
      role: 'ADMINISTRADOR',
      isActive: true,
    });
  });

  it('debe lanzar UnauthorizedException cuando el token está en lista negra', async () => {
    mockAuthService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(
      strategy.validate(mockRequest('revoked-token') as any, payload),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe lanzar UnauthorizedException con código TOKEN_REVOCADO', async () => {
    mockAuthService.isTokenBlacklisted.mockResolvedValue(true);

    try {
      await strategy.validate(mockRequest('revoked-token') as any, payload);
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe('TOKEN_REVOCADO');
    }
  });

  it('debe lanzar UnauthorizedException cuando el usuario no existe', async () => {
    mockAuthService.isTokenBlacklisted.mockResolvedValue(false);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate(mockRequest() as any, payload),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe lanzar UnauthorizedException cuando el usuario está inactivo', async () => {
    mockAuthService.isTokenBlacklisted.mockResolvedValue(false);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 1,
      email: 'admin@empresa.com',
      name: 'Admin',
      role: 'ADMINISTRADOR',
      isActive: false,
    });

    await expect(
      strategy.validate(mockRequest() as any, payload),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe lanzar UnauthorizedException con código USUARIO_INVALIDO cuando no existe o está inactivo', async () => {
    mockAuthService.isTokenBlacklisted.mockResolvedValue(false);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    try {
      await strategy.validate(mockRequest() as any, payload);
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe('USUARIO_INVALIDO');
    }
  });

  it('debe buscar el usuario con el id del payload (sub)', async () => {
    mockAuthService.isTokenBlacklisted.mockResolvedValue(false);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 42,
      email: 'user@empresa.com',
      name: 'User',
      role: 'SUPERVISOR',
      isActive: true,
    });

    await strategy.validate(mockRequest() as any, {
      sub: 42,
      email: 'user@empresa.com',
      role: 'SUPERVISOR',
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
  });
});
