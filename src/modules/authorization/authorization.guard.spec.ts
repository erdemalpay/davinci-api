import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';

describe('RolesGuard', () => {
  const authorizations = [
    { path: '/order/:id', method: 'PATCH', roles: [1] },
    { path: '/order', method: 'GET', roles: [1, 2] },
  ];
  let guard: RolesGuard;

  beforeEach(() => {
    const authService = {
      findAllAuthorizations: jest.fn(async () => authorizations),
    } as unknown as AuthorizationService;
    const reflector = {
      getAllAndOverride: jest.fn(() => undefined),
    } as unknown as Reflector;
    guard = new RolesGuard(authService, reflector);
  });

  function contextFor(request: {
    method: string;
    path: string;
    routePath?: string;
    roleId: number;
  }): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          method: request.method,
          path: request.path,
          route: request.routePath ? { path: request.routePath } : undefined,
          user: { role: { _id: request.roleId } },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('enforces roles on parameterized routes', async () => {
    const context = contextFor({
      method: 'PATCH',
      path: '/order/123',
      routePath: '/order/:id',
      roleId: 2,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows an allowed role on parameterized routes', async () => {
    const context = contextFor({
      method: 'PATCH',
      path: '/order/123',
      routePath: '/order/:id',
      roleId: 1,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('still matches static routes', async () => {
    const context = contextFor({
      method: 'GET',
      path: '/order',
      routePath: '/order',
      roleId: 3,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows routes without an authorization record', async () => {
    const context = contextFor({
      method: 'GET',
      path: '/games',
      routePath: '/games',
      roleId: 3,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
