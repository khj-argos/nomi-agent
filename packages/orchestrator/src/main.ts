import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' });

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 4001;
  await app.listen(port);

  console.log(`Nomi Control Plane running on port ${port}`);
}

bootstrap();
