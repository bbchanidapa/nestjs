import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthTokenGuard } from './auth-token.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenGuard],
  exports: [AuthService, AuthTokenGuard, JwtModule],
})
export class AuthModule {}
