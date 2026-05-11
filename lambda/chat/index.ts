/**
 * Chat backend — serves the static UI on GET / and proxies POST /chat to
 * Bedrock Agent's InvokeAgent API. Streaming is collapsed to a single JSON
 * response for simplicity; the UI shows the final assistant message.
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda';

const AGENT_ID = process.env.AGENT_ID!;
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID!;

const client = new BedrockAgentRuntimeClient({});

// The web/index.html file is copied next to the bundled handler by the
// afterBundling hook in chat-api.ts.
let HTML_CACHE: string | null = null;
const loadHtml = (): string => {
  if (HTML_CACHE) return HTML_CACHE;
  HTML_CACHE = readFileSync(join(__dirname, 'index.html'), 'utf8');
  return HTML_CACHE;
};

const json = (status: number, body: unknown): LambdaFunctionURLResult => ({
  statusCode: status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const html = (status: number, body: string): LambdaFunctionURLResult => ({
  statusCode: status,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body,
});

export const handler = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath || '/';

  if (method === 'GET' && (path === '/' || path === '')) {
    return html(200, loadHtml());
  }

  if (method === 'POST' && path === '/chat') {
    const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};
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
  }

  return json(404, { error: 'not found', path, method });
};
