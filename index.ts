import { fastify } from "fastify";

const server = fastify({ logger: true });
const port = 4000;

server.get("/", (request, reply) => {
  return "hello world";
});

const main = async () => {
  await server.listen({
    port,
    host: "0.0.0.0", // listen on all ports
  });
  console.log(`Server started at ${port}`);
};

main();
