import Fastify from "fastify";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const app = Fastify({
  logger: true,
});

app.get("/api/health", async () => {
  return {
    status: "ok",
    service: "karachordy-backend",
    timestamp: new Date().toISOString(),
  };
});

const start = async () => {
  try {
    await app.listen({ port, host });
    app.log.info(`Backend running on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
