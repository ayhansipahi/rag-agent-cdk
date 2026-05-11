// Minimal class-name joiner. AI Elements normally pulls this from shadcn/ui;
// here we inline it to avoid the full shadcn scaffolding.
export const cn = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');
