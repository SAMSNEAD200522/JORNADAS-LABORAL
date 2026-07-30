import 'reflect-metadata';
import { Role } from '@prisma/client';
import { AuthController } from './auth.controller';
import { ROLES_KEY } from './decorators/roles.decorator';
import { SchedulesController } from '../schedules/schedules.controller';

const ALL_ROLES = [
  Role.ADMINISTRADOR,
  Role.GESTION_HUMANA,
  Role.SUPERVISOR,
];

function getRoles(controller: object, methodName: string) {
  return Reflect.getMetadata(
    ROLES_KEY,
    controller.constructor.prototype[methodName],
  );
}

describe('Controller role metadata', () => {
  it('requires explicit roles for authenticated logout', () => {
    const controller = new AuthController({} as any);

    expect(getRoles(controller, 'logout')).toEqual(ALL_ROLES);
  });

  it('requires explicit roles for schedule read endpoints', () => {
    const controller = new SchedulesController({} as any);

    expect(getRoles(controller, 'findAll')).toEqual(ALL_ROLES);
    expect(getRoles(controller, 'findOne')).toEqual(ALL_ROLES);
    expect(getRoles(controller, 'findDays')).toEqual(ALL_ROLES);
  });
});
