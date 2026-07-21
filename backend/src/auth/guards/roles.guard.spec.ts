import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockRequest = (user?: unknown) => ({
    user,
  });

  const mockContext = (user?: unknown): ExecutionContext => {
    const req = mockRequest(user);
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('debe permitir acceso cuando no hay roles requeridos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = mockContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('debe permitir acceso cuando el arreglo de roles requeridos está vacío', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = mockContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('debe permitir acceso cuando el rol del usuario coincide', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMINISTRADOR]);
    const context = mockContext({ role: Role.ADMINISTRADOR });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('debe permitir acceso cuando el usuario tiene uno de los roles requeridos', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMINISTRADOR, Role.SUPERVISOR]);
    const context = mockContext({ role: Role.SUPERVISOR });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('debe denegar acceso cuando el rol del usuario no coincide', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMINISTRADOR]);
    const context = mockContext({ role: Role.GESTION_HUMANA });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('debe lanzar ForbiddenException con mensaje de rol no autorizado', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMINISTRADOR]);
    const context = mockContext({ role: Role.GESTION_HUMANA });

    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe('ROL_NO_AUTORIZADO');
      expect(response.message).toContain('GESTION_HUMANA');
      expect(response.message).toContain('ADMINISTRADOR');
    }
  });

  it('debe lanzar ForbiddenException cuando no hay usuario en la request', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMINISTRADOR]);
    const context = mockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('debe lanzar ForbiddenException con código USUARIO_NO_AUTENTICADO cuando falta el usuario', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMINISTRADOR]);
    const context = mockContext(undefined);

    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = error.getResponse() as Record<string, unknown>;
      expect(response.code).toBe('USUARIO_NO_AUTENTICADO');
    }
  });
});
