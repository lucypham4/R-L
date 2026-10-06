import './SegmentedToggle.css';

/**
 * Choose one of a few: photo or sketch, 1:1 or 4:5. The chosen option is a
 * pill that slides under the labels (`.slide-track` in global.css), so the
 * segments are all one width and the pill only ever has to know which
 * number it is on.
 *
 * `options` is [{ value, label }]; `onChange` gets the chosen value.
 */
export default function SegmentedToggle({ label, options, value, onChange, className = '' }) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      className={`segmented slide-track ${className}`}
      role="tablist"
      aria-label={label}
      style={{ '--slide-count': options.length, '--slide-index': index }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className="segmented-btn"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
