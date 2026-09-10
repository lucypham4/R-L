import './Tag.css';

export default function Tag({ selected = false, onClick, children, removable, onRemove }) {
  const interactive = onClick != null;
  const Element = interactive ? 'button' : 'span';

  return (
    <Element
      type={interactive ? 'button' : undefined}
      className={`tag ${selected ? 'tag-selected' : ''}`}
      onClick={onClick}
      aria-pressed={interactive ? selected : undefined}
    >
      {selected && <span aria-hidden="true">✓ </span>}
      {children}
      {removable && (
        <span
          className="tag-remove"
          role="button"
          tabIndex={0}
          aria-label={`Remove ${children}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRemove?.();
            }
          }}
        >
          {' '}
          ×
        </span>
      )}
    </Element>
  );
}
