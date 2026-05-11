import { useState } from 'react';
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
  PromptInputBody,
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

  return (
    <TooltipProvider>
      <div className="dark flex h-dvh flex-col bg-background text-foreground">
        <header className="flex shrink-0 items-center justify-between border-b px-6 py-4">
          <h1 className="m-0 text-base font-semibold">RAG Assistant</h1>
          <span className="text-xs text-muted-foreground">{status}</span>
        </header>

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto h-full w-full max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <ConversationEmptyState
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

        <div className="shrink-0 border-t bg-background px-4 pt-3 pb-4">
          <PromptInput onSubmit={onSubmit} className="mx-auto w-full max-w-3xl">
            <PromptInputBody>
              <PromptInputTextarea placeholder="Ask a question about the knowledge base..." />
              <PromptInputSubmit status={status === 'submitted' ? 'submitted' : undefined} />
            </PromptInputBody>
          </PromptInput>
        </div>
      </div>
    </TooltipProvider>
  );
};
