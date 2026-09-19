import './FilterSelect.css';

export default function FilterSelect({ label, value, options, onChange, onClear }) {
  const active = Boolean(value);

  return (
    <div className={`filter-select ${active ? 'filter-select-active' : ''}`}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{label}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {active ? (
        <button
          type="button"
          className="filter-select-clear"
          aria-label={`Clear ${label} filter`}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          ×
        </button>
      ) : (
        <span className="filter-select-chevron" aria-hidden="true">
          ▾
        </span>
      )}
    </div>
  );
}
