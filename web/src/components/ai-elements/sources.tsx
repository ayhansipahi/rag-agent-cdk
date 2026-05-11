import { useState } from 'react';

export interface Citation {
  source?: string;
  quote?: string;
}

export const Sources = ({ items }: { items: Citation[] }) => {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="mt-2 pt-2 border-t border-dashed border-[color:var(--color-border)] text-xs text-[color:var(--color-muted)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer hover:text-[color:var(--color-text)]"
      >
        {open ? '▾' : '▸'} {items.length} source{items.length === 1 ? '' : 's'}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((c, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <code className="text-[color:var(--color-accent)] break-all">
                {c.source ?? '(unknown source)'}
              </code>
              {c.quote && <span className="text-[color:var(--color-muted)]">{c.quote}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
