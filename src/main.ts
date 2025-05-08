import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Main');
  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Listening on ${await app.getUrl()}`);
}
bootstrap();
