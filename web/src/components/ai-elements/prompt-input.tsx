import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface PromptInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const PromptInput = ({
  onSubmit,
  disabled,
  placeholder = 'Ask a question about the knowledge base...',
}: PromptInputProps) => {
  const [value, setValue] = useState('');

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = value.trim();
    if (!t || disabled) return;
    onSubmit(t);
    setValue('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex gap-2 max-w-3xl w-full mx-auto px-4 py-3 border-t border-[color:var(--color-border)]"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        className={cn(
          'flex-1 resize-none min-h-[44px] max-h-[200px] rounded-lg px-3 py-2',
          'bg-[color:var(--color-panel)] text-[color:var(--color-text)]',
          'border border-[color:var(--color-border)] outline-none',
          'focus:border-[color:var(--color-accent)]',
        )}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={cn(
          'rounded-lg px-4 font-semibold cursor-pointer',
          'bg-[color:var(--color-accent)] text-[color:var(--color-bg)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        Send
      </button>
    </form>
  );
};
