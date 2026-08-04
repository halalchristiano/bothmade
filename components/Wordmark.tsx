/**
 * The wordmark, in one place.
 *
 * "both" in a sky wireframe stroke, "made" solid — the mark literally encodes
 * the positioning (wireframe web + solid native), which is why it must not be
 * re-typeset per surface: the admin sidebar had drifted to a solid sky fill,
 * quietly deleting the story. Marketing nav and dashboard now render this
 * same component, so the one element that *is* the brand cannot fork again.
 */
export function Wordmark({ className = 'text-2xl' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight select-none ${className}`}>
      <span
        className="text-transparent"
        style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}
      >
        both
      </span>
      <span className="text-white">made</span>
    </span>
  );
}
