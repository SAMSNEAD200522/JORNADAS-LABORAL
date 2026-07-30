import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { config } from './config/env';
import { resolve } from 'path';
import * as fs from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.sheetjs.com',
            'https://fonts.googleapis.com',
          ],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  app.setGlobalPrefix(config.prefix);
  app.useGlobalPipes(globalValidationPipe);
  app.useGlobalFilters(new AllExceptionsFilter());
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3001', 'http://localhost:3000'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const frontendDir = process.env.FRONTEND_DIR;
  if (frontendDir && fs.existsSync(frontendDir)) {
    app.useStaticAssets(frontendDir);
    console.log(`Serving frontend from FRONTEND_DIR: ${frontendDir}`);
  } else {
    const backendRoot = resolve(__dirname, '..', '..');
    const frontendCandidates = [
      resolve(backendRoot, '..', 'frontend'),
      resolve(backendRoot, 'frontend'),
    ];

    for (const candidate of frontendCandidates) {
      if (fs.existsSync(candidate)) {
        app.useStaticAssets(candidate);
        console.log(`Serving frontend from: ${candidate}`);
        break;
      }
    }
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Control y Gestión de Jornadas Laborales')
    .setDescription(
      'API para el control y gestión de jornadas laborales de empleados',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.port);
  console.log(
    `API corriendo en http://localhost:${config.port}${config.prefix}`,
  );
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `Documentación Swagger en http://localhost:${config.port}/api/docs`,
    );
  }
}
bootstrap();
