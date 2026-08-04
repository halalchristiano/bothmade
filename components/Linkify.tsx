/**
 * Plain text with clickable links.
 *
 * Every chat surface in the product renders text a person typed, and people
 * type URLs — which rendered as inert strings the reader had to copy by
 * hand. One component, used by the client thread, the admin thread, and the
 * team chat, so "paste a link" works the same everywhere.
 */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-300 underline decoration-sky-300/40 hover:decoration-sky-300 break-all"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
