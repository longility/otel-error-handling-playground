import { ApplicationError, ApplicationErrorCodes } from "application-error";
import "./tracing";
import { fastify } from "fastify";
import { z } from "zod";
import { context, trace } from "@opentelemetry/api";

const server = fastify({ logger: true });
const port = 4000;

server.get("/", (request, reply) => {
  reply.send();
});

server.get("/non-application-error", (request, reply) => {
  throw new Error(
    "I am not an application error. Simulating an unexpected thrown error."
  );
});

const ApplicationErrorRequestQuery = z.object({
  code: z.enum(ApplicationErrorCodes),
});

server.get("/application-error", (request, reply) => {
  const query = ApplicationErrorRequestQuery.parse(request.query);
  throw new ApplicationError(
    "intentionally throwing an error from the application",
    query.code
  );
});

server.get("/application-error-with-cause", (request, reply) => {
  try {
    throw new Error(
      "I am not an application error. Simulating an unexpected thrown error."
    );
  } catch (e) {
    throw ApplicationError.from(
      e,
      "capturing and transforming into application error",
      "ALREADY_EXISTS"
    );
  }
});

server.get("/zod-error", (request, reply) => {
  const unparsed = { foo: "bar" };

  const Parser = z.object({ foo: z.number() });

  Parser.parse(unparsed); // should blow up
});

server.get("/record-and-swallow", (request, reply) => {
  const span = trace.getSpan(context.active());
  try {
    throw new Error(
      "I am not an application error. Simulating an unexpected thrown error."
    );
  } catch (e) {
    if (e instanceof Error) span?.recordException(e);
    else throw e;
  }

  reply.send(200);
});

server.get("/log", (request, reply) => {
  const span = trace.getSpan(context.active());
  span?.addEvent("if-log-is-needed-for-success-responses", {
    foo: "bar",
  });
  reply.send(200);
});

server.get("/capturing-a-span", async (request, reply) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const tracer = trace.getTracer("long-otel-error-handling-poc");
  await tracer.startActiveSpan("test span abc", async (span) => {
    try {
      span.setAttribute("abc.foo", "bar");
      span.setAttribute("abc.version", "1.2.3");
      await new Promise((resolve) => setTimeout(resolve, 100));
      span.addEvent("some-log", {
        foo: "bar",
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const deeplyNestedRetrievalOfSpan = trace.getSpan(context.active());
      deeplyNestedRetrievalOfSpan?.recordException(
        new Error("deeplyNestedRetrievalOfSpan")
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      span.end();
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 100));
  reply.send(200);
});

const main = async () => {
  await server.listen({
    port,
    host: "0.0.0.0", // listen on all ports
  });
  console.log(`Server started at ${port}`);
};

main();
