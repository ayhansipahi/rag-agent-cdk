import { useState } from 'react';
import { MessagesSquare, Sparkles } from 'lucide-react';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from '@/components/ai-elements/sources';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';
import { TooltipProvider } from '@/components/ui/tooltip';

interface Citation {
  source?: string;
  quote?: string;
}
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

type Status = 'ready' | 'submitted' | 'error';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Math.random());

export const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('ready');

  const send = async (text: string) => {
    const userMsg: ChatMessage = { id: newId(), role: 'user', text };
    const botMsg: ChatMessage = { id: newId(), role: 'assistant', text: '', pending: true };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setStatus('submitted');

    try {
      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });
      if (!res.ok || !res.body) throw new Error(`request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // NDJSON: split on newline, last partial line stays in buffer.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line) continue;
          let evt: { t: string; v?: string; citations?: Citation[]; sessionId?: string; message?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.t === 'text' && evt.v) {
            acc += evt.v;
            const snapshot = acc;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botMsg.id
                  ? { ...m, text: snapshot, pending: false }
                  : m,
              ),
            );
            if (firstChunk) {
              setStatus('ready');
              firstChunk = false;
            }
          } else if (evt.t === 'done') {
            if (evt.sessionId) setSessionId(evt.sessionId);
            const citations = evt.citations;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botMsg.id ? { ...m, citations, pending: false } : m,
              ),
            );
          } else if (evt.t === 'error') {
            throw new Error(evt.message ?? 'agent invocation failed');
          }
        }
      }
      setStatus('ready');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown error';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsg.id ? { ...m, text: `Error: ${errMsg}`, pending: false } : m,
        ),
      );
      setStatus('error');
    }
  };

  const onSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text) return;
    void send(text);
  };

  const statusLabel = status === 'submitted' ? 'thinking…' : status === 'error' ? 'error' : 'ready';
  const statusDot =
    status === 'submitted'
      ? 'bg-amber-400 animate-pulse'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-emerald-400';

  return (
    <TooltipProvider>
      <div className="dark flex h-dvh flex-col bg-background text-foreground">
        <header className="flex shrink-0 items-center justify-between border-b border-border/60 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
              <MessagesSquare className="size-4" />
            </span>
            <div className="leading-tight">
              <h1 className="m-0 text-sm font-semibold tracking-tight">RAG Assistant</h1>
              <p className="text-[11px] text-muted-foreground">Claude · Bedrock · OpenSearch</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-1.5 rounded-full ${statusDot}`} />
            <span>{statusLabel}</span>
          </div>
        </header>

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto h-full w-full max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Sparkles className="size-5" />
                  </span>
                }
                title="Ask anything about the knowledge base"
                description="The seed corpus covers architecture, costs, and how to add your own docs."
              />
            ) : (
              messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {m.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    ) : m.pending ? (
                      <span className="italic text-muted-foreground">…</span>
                    ) : (
                      <MessageResponse>{m.text}</MessageResponse>
                    )}
                    {m.citations && m.citations.length > 0 && (
                      <Sources>
                        <SourcesTrigger count={m.citations.length} />
                        <SourcesContent>
                          {m.citations.map((c, i) => (
                            <Source
                              key={i}
                              href={c.source ?? '#'}
                              title={c.source ?? 'source'}
                            >
                              {c.quote ?? c.source}
                            </Source>
                          ))}
                        </SourcesContent>
                      </Sources>
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="shrink-0 px-4 pt-4 pb-6">
          <PromptInput onSubmit={onSubmit} className="mx-auto w-full max-w-3xl">
            {/* No PromptInputBody wrapper: it adds `display: contents`, which
                keeps `<textarea>` a DOM grandchild of `<InputGroup>` so
                Tailwind's `has-[>textarea]:h-auto` doesn't fire and the
                container stays at h-8 (32px) — clipping the textarea's top
                via InputGroup's `overflow-hidden`. */}
            <PromptInputTextarea placeholder="Ask a question about the knowledge base…" />
            <PromptInputSubmit status={status === 'submitted' ? 'submitted' : undefined} />
          </PromptInput>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
            Grounded on documents in S3 · responses include citations · multi-turn context preserved.
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
};
