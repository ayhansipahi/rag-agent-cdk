import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

export type Role = 'user' | 'assistant';

export const Message = ({
  role,
  children,
  className,
}: PropsWithChildren<{ role: Role; className?: string }>) => (
  <div
    className={cn(
      'rounded-lg px-4 py-3 leading-relaxed',
      role === 'user'
        ? 'bg-[color:var(--color-user)]'
        : 'bg-[color:var(--color-bot)] border border-[color:var(--color-border)]',
      className,
    )}
  >
    <div className="text-[11px] uppercase tracking-wider text-[color:var(--color-muted)] mb-1">
      {role === 'user' ? 'You' : 'Assistant'}
    </div>
    {children}
  </div>
);

export const MessageContent = ({ children }: PropsWithChildren) => (
  <div className="prose-chat text-[color:var(--color-text)]">{children}</div>
);
