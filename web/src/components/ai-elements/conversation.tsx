import { useEffect, useRef, type PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

/**
 * Conversation — scroll container that auto-sticks to the bottom on new
 * children unless the user has scrolled up. Mirrors AI Elements' Conversation
 * primitive; we inline a thin version to avoid the full shadcn/ui scaffold.
 */
export const Conversation = ({ children, className }: PropsWithChildren<{ className?: string }>) => {
  const ref = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.clientHeight - el.scrollTop < 40;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  });

  return (
    <div
      ref={ref}
      className={cn(
        'flex-1 overflow-y-auto px-4 py-6 max-w-3xl w-full mx-auto',
        className,
      )}
    >
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
};

export const ConversationContent = ({ children }: PropsWithChildren) => <>{children}</>;
