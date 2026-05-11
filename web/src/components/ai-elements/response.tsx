import { Streamdown } from 'streamdown';

/**
 * Response — renders streaming or final markdown text. AI Elements' Response
 * component is a Streamdown wrapper with sensible defaults for AI chat. We
 * keep the same name so the App code reads identically to the AI Elements
 * example library.
 */
export const Response = ({ text }: { text: string }) => (
  <div className="prose-chat">
    <Streamdown>{text}</Streamdown>
  </div>
);
