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
 */
const mockChatBackend = (): Plugin => ({
  name: 'mock-chat-backend',
  configureServer(server) {
    server.middlewares.use('/chat', (req, res, next) => {
      if (req.method !== 'POST') return next();
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
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
          'The CDK stack is not deployed yet, so this is a canned reply that exercises the UI:',
          '',
          '- `Conversation` scrolls and sticks to the bottom on new messages.',
          '- `Response` is wrapping `streamdown`, so this list and the inline `code` render as markdown.',
          '- `Sources` below is collapsible.',
          '',
          'Deploy the stack (`npm run deploy`) and rerun this dev server with `VITE_BACKEND_URL=https://<your-fn-url>` to hit the real Bedrock Agent.',
        ].join('\n');
        const citations = [
          { source: 's3://rag-assistant-docs/about.md', quote: 'Mock citation: this would be the matched chunk from the seeded knowledge base.' },
          { source: 's3://rag-assistant-docs/architecture.md', quote: 'Mock citation: OpenSearch Serverless 2-OCU minimum dominates the bill.' },
        ];
        setTimeout(() => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ answer, citations, sessionId: sessionId ?? 'mock-session' }));
        }, 600);
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
