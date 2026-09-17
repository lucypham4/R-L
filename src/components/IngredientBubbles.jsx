import { useState } from 'react';
import './Bubbles.css';

export default function IngredientBubbles({ value, onChange }) {
  const [draft, setDraft] = useState('');

  function addIngredient() {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft('');
  }

  function removeIngredient(item) {
    onChange(value.filter((v) => v !== item));
  }

  return (
    <div className="bubble-row">
      {value.map((item) => (
        <span key={item} className="bubble bubble-ingredient">
          {item}
          <span
            className="bubble-delete"
            role="button"
            aria-label={`Remove ${item}`}
            onClick={() => removeIngredient(item)}
          >
            ×
          </span>
        </span>
      ))}
      <input
        className="bubble-add-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addIngredient();
          }
        }}
        onBlur={addIngredient}
        placeholder="Add ingredient"
      />
    </div>
  );
}
