import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  const allowedOrigins =
    corsOrigin === '*'
      ? true
      : corsOrigin.split(',').map((origin) => origin.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
