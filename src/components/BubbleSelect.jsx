import { useEffect, useRef, useState } from 'react';
import { loadBubbleList, saveBubbleList } from '../lib/bubbleLists';
import './Bubbles.css';

const LONG_PRESS_MS = 500;

export default function BubbleSelect({ kind, value, onChange }) {
  const [options, setOptions] = useState(() => loadBubbleList(kind));
  const [deletableOption, setDeletableOption] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const pressTimer = useRef(null);
  const addInputRef = useRef(null);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  function persist(next) {
    setOptions(next);
    saveBubbleList(kind, next);
  }

  function startPress(option) {
    pressTimer.current = setTimeout(() => setDeletableOption(option), LONG_PRESS_MS);
  }

  function cancelPress() {
    clearTimeout(pressTimer.current);
  }

  function handleSelect(option) {
    // The long-press that opens the delete badge is immediately followed by
    // a native click on the same element; ignore it instead of dismissing
    // the badge we just opened.
    if (deletableOption === option) return;
    if (deletableOption) {
      setDeletableOption(null);
      return;
    }
    onChange(value === option ? '' : option);
  }

  function handleDelete(option) {
    persist(options.filter((o) => o !== option));
    setDeletableOption(null);
    if (value === option) onChange('');
  }

  function commitAdd() {
    const trimmed = draft.trim();
    if (trimmed && !options.includes(trimmed)) {
      persist([...options, trimmed]);
      onChange(trimmed);
    }
    setDraft('');
    setAdding(false);
  }

  return (
    <div className="bubble-row" onClick={() => setDeletableOption(null)}>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={`bubble ${value === option ? 'bubble-selected' : ''}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            startPress(option);
          }}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onClick={(e) => {
            e.stopPropagation();
            handleSelect(option);
          }}
        >
          {option}
          {deletableOption === option && (
            <span
              className="bubble-delete"
              role="button"
              aria-label={`Remove ${option}`}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(option);
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}

      {adding ? (
        <input
          ref={addInputRef}
          className="bubble-add-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitAdd();
            }
            if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          onBlur={commitAdd}
          placeholder="New"
        />
      ) : (
        <button
          type="button"
          className="bubble bubble-add"
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
          aria-label="Add"
        >
          +
        </button>
      )}
    </div>
  );
}
