# long-otel-error-handling-poc

## TODO

- [ ] calling another api
- [ ] async continuation of trace

## Code dump for async continuation of trace

Producer

```
const span = trace.getSpan(context.active());
const spanContext = span?.spanContext();
```

Consumer

```
import "./tracing";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { tracer } from "./utils";
import { documentClient } from "./document-client";
import {
  context,
  propagation,
  ProxyTracerProvider,
  ROOT_CONTEXT,
  SpanContext,
  trace,
} from "@opentelemetry/api";
import { BasicTracerProvider } from "@opentelemetry/tracing";

function getBasicTracerProvider() {
  let realTracerProvider = trace.getTracerProvider();
  if (realTracerProvider instanceof ProxyTracerProvider) {
    realTracerProvider = realTracerProvider.getDelegate();
  }

  return realTracerProvider instanceof BasicTracerProvider
    ? realTracerProvider
    : undefined;
}

//https://github.com/open-telemetry/opentelemetry-js-api/blob/main/docs/context.md
// what is diff between context and span context?

const purgeOutboxItems = async () => {
  const result = await documentClient.send(
    new ScanCommand({
      TableName: "Outbox",
    })
  );

  if (!result.Count) return;
  result.Items!.forEach(async (item: any) => {
    const spanContext: SpanContext = item.spanContext;
    const carrier = {
      traceparent: `00-${spanContext.traceId}-${
        spanContext.spanId
      }-${spanContext.traceFlags.toString().padStart(2, "0")}`,
    };
    const ctx = propagation.extract(ROOT_CONTEXT, carrier);

    const span = tracer.startSpan("purge-outbox-item", undefined, ctx);
    try {
      await context.with(trace.setSpan(context.active(), span), async () => {
        const r = await documentClient.send(
          new DeleteCommand({ TableName: "Outbox", Key: { id: item.id } })
        );
      });
    } catch (e) {
      span.recordException(e as Error);
    } finally {
      span.end();
      getBasicTracerProvider()?.getActiveSpanProcessor().forceFlush();
    }
  });
};

setTimeout(() => {
  purgeOutboxItems()
    .then(() => console.log("purge successful"))
    .catch((e) => console.error("purge failed", e));
}, 2000);
```
