import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly authService: AuthorizationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const requestPath = req.path;
    const requestMethod = req.method; // Get HTTP method

    // Retrieve all authorizations from your service
    const authorizations = await this.authService.findAllAuthorizations();
    // Find a matching authorization record that checks both path and method
    const foundAuth = authorizations.find(
      (auth) => auth.path === requestPath && auth.method === requestMethod,
    );

    // If no specific authorization is defined, allow access.
    if (!foundAuth) {
      return true;
    }

    const allowedRoles = foundAuth.roles;
    if (
      allowedRoles.length > 0 &&
      (!user || !allowedRoles.includes(user.role._id))
    ) {
      throw new ForbiddenException('Forbidden');
    }
    return true;
  }
}
