import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl =
          configService.get<string>('DATABASE_URL') ??
          configService.get<string>('NEON_DATABASE_URL') ??
          configService.get<string>('POSTGRES_URL');
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';
        const dbSslValue = configService.get<string>('DB_SSL');
        const sslEnabled =
          dbSslValue !== undefined
            ? dbSslValue === 'true'
            : isProduction || Boolean(databaseUrl);

        // In production/cloud, require URL-based database config (Neon/managed DB).
        if (isProduction && !databaseUrl) {
          throw new Error(
            'DATABASE_URL (or NEON_DATABASE_URL/POSTGRES_URL) is required in production.',
          );
        }

        const baseConfig = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: false,
          ssl: sslEnabled ? ({ rejectUnauthorized: false } as const) : false,
        };

        if (databaseUrl) {
          return {
            ...baseConfig,
            url: databaseUrl,
          };
        }

        return {
          ...baseConfig,
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: Number(configService.get<string>('DB_PORT', '5432')),
          username: configService.get<string>('DB_USER', 'postgres'),
          password: configService.get<string>('DB_PASS', ''),
          database: configService.get<string>('DB_NAME', 'postgres'),
        };
      },
    }),
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
