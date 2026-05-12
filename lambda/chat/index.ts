/**
 * Chat backend — streaming JSON-Lines API that proxies a user message to a
 * Bedrock Agent's InvokeAgent endpoint and writes each text chunk as soon as
 * Bedrock yields it, then closes with a final `done` event carrying citations
 * and the session id.
 *
 * Wire format (NDJSON, one event per line):
 *   {"t":"text","v":"<token chunk>"}     — repeated for every Bedrock chunk
 *   {"t":"done","citations":[...],"sessionId":"..."}    — once, at end
 *
 * Runs under Lambda's `RESPONSE_STREAM` invoke mode using the global
 * `awslambda.streamifyResponse` helper.
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { randomUUID } from 'crypto';
import { Writable } from 'stream';
import type { LambdaFunctionURLEvent } from 'aws-lambda';

// awslambda is a runtime-injected global for Node.js Lambdas using the
// RESPONSE_STREAM invoke mode. It's not in @types/aws-lambda, so we declare a
// minimal shape inline.
type HttpResponseMetadata = {
  statusCode: number;
  headers?: Record<string, string>;
  cookies?: string[];
};
declare const awslambda: {
  streamifyResponse(
    handler: (event: LambdaFunctionURLEvent, responseStream: Writable) => Promise<void>,
  ): unknown;
  HttpResponseStream: {
    from(stream: Writable, metadata: HttpResponseMetadata): Writable;
  };
};

const AGENT_ID = process.env.AGENT_ID!;
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID!;
const client = new BedrockAgentRuntimeClient({});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const writeLine = (s: Writable, obj: unknown) => {
  s.write(JSON.stringify(obj) + '\n');
};

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const method = event.requestContext.http.method;
  const path = event.rawPath || '/';

  if (method === 'OPTIONS') {
    const out = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 204,
      headers: CORS,
    });
    out.end();
    return;
  }

  if (method !== 'POST' || path !== '/chat') {
    const out = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 404,
      headers: { 'content-type': 'application/json', ...CORS },
    });
    out.write(JSON.stringify({ error: 'not found', path, method }));
    out.end();
    return;
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString()
    : event.body ?? '{}';
  let body: { message?: string; sessionId?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    body = {};
  }
  const message = (body.message ?? '').trim();
  const sessionId = body.sessionId ?? randomUUID();

  const out = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS,
    },
  });

  if (!message) {
    writeLine(out, { t: 'error', message: 'message is required' });
    out.end();
    return;
  }

  try {
    const res = await client.send(
      new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId,
        inputText: message,
        enableTrace: false,
        // streamFinalResponse=true tells Bedrock to emit model tokens as the
        // model generates them, rather than buffering the whole answer + any
        // attribution + output guardrails before yielding. Without it,
        // `res.completion` yields a single chunk even for long answers.
        streamingConfigurations: {
          streamFinalResponse: true,
          applyGuardrailInterval: 200,
        },
      }),
    );

    const citations: { source?: string; quote?: string }[] = [];
    const decoder = new TextDecoder();

    if (res.completion) {
      for await (const chunk of res.completion) {
        if (chunk.chunk?.bytes) {
          const text = decoder.decode(chunk.chunk.bytes);
          if (text) writeLine(out, { t: 'text', v: text });
        }
        if (chunk.chunk?.attribution?.citations) {
          for (const c of chunk.chunk.attribution.citations) {
            for (const ref of c.retrievedReferences ?? []) {
              citations.push({
                source: ref.location?.s3Location?.uri,
                quote: ref.content?.text?.slice(0, 240),
              });
            }
          }
        }
      }
    }

    writeLine(out, { t: 'done', citations, sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'agent invocation failed';
    writeLine(out, { t: 'error', message });
  } finally {
    out.end();
  }
});
