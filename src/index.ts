import { ApplicationError, ApplicationErrorCodes } from "application-error";
import "./tracing";
import { fastify } from "fastify";
import { ZodError, z } from "zod";
import { context, trace } from "@opentelemetry/api";

const server = fastify({ logger: true });
const port = 4000;

server.get("/", (request, reply) => {
  reply.send();
});

server.get("/non-application-error", (request, reply) => {
  const array: string[] = 5 as any;
  if (array.filter((a) => a.length === 5).length === 5) {
    console.log("should blow up on previous line");
  }
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
  const tracer = trace.getTracer("otel-error-handling-playground");
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

server.addHook("onError", async (request, reply, error) => {
  const span = trace.getSpan(context.active());

  if (error instanceof ApplicationError && error.cause instanceof Error)
    span?.recordException(error.cause);
  if (error instanceof Error) span?.recordException(error);
});

server.setErrorHandler(function (error, request, reply) {
  if (error instanceof ApplicationError) {
    const { statusCode, message, metadata } = transformApplicationError(error);
    reply.code(statusCode).send({ message, metadata });
  } else if (error instanceof ZodError) {
    //  https://github.com/colinhacks/zod/blob/master/ERROR_HANDLING.md
    const flattenedError = error.flatten();
    if (flattenedError.formErrors.length > 0) {
      reply.code(400).send({
        message: "The form has errors",
        metadata: { type: "formErrors", formErrors: flattenedError.formErrors },
      });
    } else {
      reply.code(400).send({
        message: "The fields have errors",
        metadata: { type: "fieldErrors", ...flattenedError.fieldErrors },
      });
    }
  } else if (error instanceof Error) {
    reply.code(500).send({ message: "it's not you it's me" });
  } else {
    reply.send(error);
  }
});

const main = async () => {
  await server.listen({
    port,
    host: "0.0.0.0", // listen on all ports
  });
  console.log(`Server started at ${port}`);
};

main();

const transformApplicationError = ({
  code,
  message,
  metadata,
}: ApplicationError) => {
  switch (code) {
    case "CANCELED":
      return { statusCode: 408, message };
    case "UNKNOWN":
      return { statusCode: 500, message: "it's not you it's me" };
    case "INVALID_ARGUMENT":
      return { statusCode: 400, message, metadata };
    case "DEADLINE_EXCEEDED":
      return { statusCode: 408, message };
    case "NOT_FOUND":
      return { statusCode: 404, message };
    case "ALREADY_EXISTS":
      return { statusCode: 409, message, metadata };
    case "PERMISSION_DENIED":
      return { statusCode: 403, message };
    case "RESOURCE_EXHAUSTED":
      return { statusCode: 429, message };
    case "FAILED_PRECONDITION":
      return { statusCode: 412, message, metadata };
    case "ABORTED":
      return { statusCode: 409, message };
    case "OUT_OF_RANGE":
      return { statusCode: 400, message };
    case "UNIMPLEMENTED":
      return { statusCode: 404, message };
    case "INTERNAL":
      return { statusCode: 500, message: "it's not you it's me" };
    case "UNAVAILABLE":
      return { statusCode: 503, message };
    case "DATA_LOSS":
      return { statusCode: 500, message };
    case "UNAUTHENTICATED":
      return { statusCode: 401, message };
  }
};
