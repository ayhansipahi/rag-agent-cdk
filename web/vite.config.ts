import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mock /chat backend for local development before the CDK stack is deployed.
 * Activated only when VITE_BACKEND_URL is unset — otherwise the standard
 * proxy below forwards requests to the real Lambda Function URL.
 *
 * Streams NDJSON events matching the production Lambda's wire format:
 *   {"t":"text","v":"<chunk>"} repeatedly
 *   {"t":"done","citations":[...],"sessionId":"..."} once at the end
 */
const mockChatBackend = (): Plugin => ({
  name: 'mock-chat-backend',
  configureServer(server) {
    server.middlewares.use('/chat', (req, res, next) => {
      if (req.method !== 'POST') return next();
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        let message = '';
        let sessionId: string | null = null;
        try {
          const parsed = JSON.parse(body || '{}');
          message = String(parsed.message ?? '');
          sessionId = parsed.sessionId ?? null;
        } catch {
          /* ignore */
        }
        const answer = [
          `**Mock response.** You asked: *${message || '(empty)'}*.`,
          '',
          'The CDK stack is not deployed; this is a streamed canned reply that exercises the UI end-to-end:',
          '',
          '- `Conversation` scrolls and sticks to the bottom on new tokens.',
          '- `MessageResponse` is wrapping `streamdown` in streaming mode, so markdown renders as it arrives.',
          '- `Sources` below collapses by default.',
          '',
          'Deploy the stack (`npm run deploy`) and rerun this dev server with `VITE_BACKEND_URL=https://<your-fn-url>` to hit the real Bedrock Agent.',
        ].join('\n');
        const citations = [
          { source: 's3://rag-assistant-docs/about.md', quote: 'Mock citation: this would be the matched chunk from the seeded knowledge base.' },
          { source: 's3://rag-assistant-docs/architecture.md', quote: 'Mock citation: OpenSearch Serverless 2-OCU minimum dominates the bill.' },
        ];

        res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.statusCode = 200;

        // Chunk the answer into small pieces so the UI shows real streaming.
        const tokens = answer.match(/.{1,8}|\n/gs) ?? [answer];
        for (const tok of tokens) {
          res.write(JSON.stringify({ t: 'text', v: tok }) + '\n');
          await new Promise((r) => setTimeout(r, 25));
        }
        res.write(
          JSON.stringify({ t: 'done', citations, sessionId: sessionId ?? 'mock-session' }) +
            '\n',
        );
        res.end();
      });
    });
  },
});

const hasBackendUrl = Boolean(process.env.VITE_BACKEND_URL);

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(hasBackendUrl ? [] : [mockChatBackend()])],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: hasBackendUrl
      ? {
          '/chat': {
            target: process.env.VITE_BACKEND_URL!,
            changeOrigin: true,
          },
        }
      : undefined,
  },
});
