import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';

type AuthPayload = {
  sub: string;
  email: string;
  role: string;
};

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthPayload;
    }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const accessToken = authHeader.slice('Bearer '.length).trim();
    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AuthPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthPayload>(accessToken);
    } catch (error) {
      const errorName =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        typeof (error as { name: unknown }).name === 'string'
          ? (error as { name: string }).name
          : '';

      if (errorName === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }

      throw new UnauthorizedException('Token ไม่ถูกต้อง');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Token ไม่ถูกต้อง');
    }

    const isValid = await this.authService.validateAccessToken(
      accessToken,
      payload.sub,
    );

    if (!isValid) {
      throw new UnauthorizedException('Token has expired');
    }

    request.user = payload;
    return true;
  }
}
