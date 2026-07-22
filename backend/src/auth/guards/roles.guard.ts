import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Usuario no autenticado',
        code: 'USUARIO_NO_AUTENTICADO',
      });
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: `Tu rol "${user.role}" no tiene permisos para esta acción. Roles requeridos: ${requiredRoles.join(', ')}`,
        code: 'ROL_NO_AUTORIZADO',
      });
    }

    return true;
  }
}
