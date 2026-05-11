/**
 * Chat backend — JSON API that proxies a user message to a Bedrock Agent's
 * InvokeAgent endpoint and returns the assembled answer plus citations.
 *
 * Streaming is collapsed to a single JSON response: AI Elements + the AI SDK
 * support token-by-token streaming, but for the v0 of this stack a blocking
 * response keeps the protocol simple and citations land in a single payload
 * that the Sources component can render.
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { randomUUID } from 'crypto';
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';

const AGENT_ID = process.env.AGENT_ID!;
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID!;

const client = new BedrockAgentRuntimeClient({});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown): LambdaFunctionURLResult => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', ...CORS },
  body: JSON.stringify(body),
});

export const handler = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath || '/';

  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (method === 'GET' && path === '/health') return json(200, { ok: true });

  if (method !== 'POST' || path !== '/chat') {
    return json(404, { error: 'not found', path, method });
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString()
    : event.body ?? '{}';
  const body = JSON.parse(raw);
  const message: string = body.message ?? '';
  const sessionId: string = body.sessionId ?? randomUUID();
  if (!message.trim()) return json(400, { error: 'message is required' });

  try {
    const res = await client.send(
      new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId,
        inputText: message,
        enableTrace: false,
      }),
    );

    let answer = '';
    const citations: { source?: string; quote?: string }[] = [];

    if (res.completion) {
      for await (const chunk of res.completion) {
        if (chunk.chunk?.bytes) {
          answer += new TextDecoder().decode(chunk.chunk.bytes);
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

    return json(200, { answer: answer.trim(), citations, sessionId });
  } catch (err: any) {
    console.error('InvokeAgent error', err);
    return json(500, { error: err.message ?? 'agent invocation failed' });
  }
};
