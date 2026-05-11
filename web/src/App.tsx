import { useState } from 'react';
import { Conversation } from './components/ai-elements/conversation';
import { Message, MessageContent } from './components/ai-elements/message';
import { Response } from './components/ai-elements/response';
import { Sources, type Citation } from './components/ai-elements/sources';
import { PromptInput } from './components/ai-elements/prompt-input';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  pending?: boolean;
}

interface ChatResponse {
  answer: string;
  citations: Citation[];
  sessionId: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

export const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'ready' | 'thinking' | 'error'>('ready');

  const send = async (text: string) => {
    const userMsg: ChatMessage = { id: newId(), role: 'user', text };
    const botMsg: ChatMessage = { id: newId(), role: 'assistant', text: '', pending: true };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setPending(true);
    setStatus('thinking');

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = (await res.json()) as ChatResponse | { error: string };
      if (!res.ok || 'error' in data) {
        throw new Error('error' in data ? data.error : 'request failed');
      }
      setSessionId(data.sessionId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsg.id
            ? { ...m, text: data.answer, citations: data.citations, pending: false }
            : m,
        ),
      );
      setStatus('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsg.id ? { ...m, text: `Error: ${msg}`, pending: false } : m,
        ),
      );
      setStatus('error');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--color-border)]">
        <h1 className="text-base font-semibold m-0">RAG Assistant</h1>
        <span className="text-xs text-[color:var(--color-muted)]">{status}</span>
      </header>

      <Conversation>
        {messages.length === 0 && (
          <div className="text-center text-sm text-[color:var(--color-muted)] py-12">
            Ask a question about the seeded knowledge base.
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} role={m.role}>
            {m.role === 'user' ? (
              <MessageContent>{m.text}</MessageContent>
            ) : (
              <MessageContent>
                {m.pending ? (
                  <span className="italic text-[color:var(--color-muted)]">…</span>
                ) : (
                  <Response text={m.text} />
                )}
                {m.citations && <Sources items={m.citations} />}
              </MessageContent>
            )}
          </Message>
        ))}
      </Conversation>

      <PromptInput onSubmit={send} disabled={pending} />
    </div>
  );
};
