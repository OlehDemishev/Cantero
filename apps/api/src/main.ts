import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { PublicApiModule } from "./public-api/public-api.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix("api");

  // Docs cover only the public v1 integration API (PublicApiModule), not the internal
  // JWT-authenticated app surface — this is a reference for third-party integrators.
  const publicApiConfig = new DocumentBuilder()
    .setTitle("Cantero Public API")
    .setDescription("Read-only integration API for external tools (accounting, BI, custom scripts). Authenticate with an X-Api-Key header issued from Settings → API keys.")
    .setVersion("1.0")
    .addApiKey({ type: "apiKey", name: "X-Api-Key", in: "header" }, "apiKey")
    .build();
  const publicApiDocument = SwaggerModule.createDocument(app, publicApiConfig, { include: [PublicApiModule] });
  SwaggerModule.setup("api/docs", app, publicApiDocument);

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
}
bootstrap();
