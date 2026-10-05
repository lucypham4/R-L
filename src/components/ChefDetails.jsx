import { useState } from 'react';
import { linksToShow } from '../lib/socialLinks';
import { SPECIALTIES_MAX, SPECIALTY_MAX_LENGTH } from '../lib/chefsApi';
import CloseIcon from './CloseIcon';
import './ChefDetails.css';

// Somewhere to start, for a chef who hasn't thought of how to put it.
// Anything else they type is added alongside.
const SUGGESTED_SPECIALTIES = [
  'Seasonal',
  'Plant-based',
  'Seafood',
  'Pastry',
  'Bread',
  'Fermentation',
  'Gluten-free',
  'Dinner parties',
  'Tasting menus',
  'Meal prep',
];

// "Chef Ana", as the sketch has it, without making "Chef Ana" into
// "Chef Chef Ana" for anyone who already called themselves that.
export function chefTitle(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return /^chef\b/i.test(trimmed) ? trimmed : `Chef ${trimmed}`;
}

/** What the chef is known for, as a row of tags. */
export function SpecialtyTags({ specialties, className = '' }) {
  if (!specialties?.length) return null;
  return (
    <ul className={`chef-tags ${className}`} aria-label="Specialties">
      {specialties.map((tag) => (
        <li key={tag} className="chef-tag">
          {tag}
        </li>
      ))}
    </ul>
  );
}

function LinkIcon({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      {kind === 'instagram' && (
        <g {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17" cy="7" r="0.6" fill="currentColor" />
        </g>
      )}
      {kind === 'tiktok' && (
        <g {...common}>
          <path d="M14 3.5v11.25a3.75 3.75 0 1 1-3.75-3.75" />
          <path d="M14 3.5c.4 2.6 2.2 4.4 5 4.75" />
        </g>
      )}
      {kind === 'youtube' && (
        <g {...common}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10.5 9.5v5l4.25-2.5z" fill="currentColor" />
        </g>
      )}
      {kind === 'website' && (
        <g {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17" />
          <path d="M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z" />
        </g>
      )}
    </svg>
  );
}

/**
 * Where else to find the chef, as a row of icons: the platform says
 * enough, and the handle is what the link is for. Screen readers and a
 * hover still get the platform and handle. Every href is rebuilt from
 * what's stored.
 */
export function SocialLinks({ links, className = '' }) {
  const shown = linksToShow(links);
  if (!shown.length) return null;
  return (
    <ul className={`chef-links ${className}`} aria-label="Links">
      {shown.map((link) => (
        <li key={link.key}>
          <a
            className="chef-link"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            title={`${link.label}: ${link.text}`}
          >
            <LinkIcon kind={link.key} />
            <span className="visually-hidden">
              {link.label}: {link.text}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Picks the chef's specialties: tap a suggestion to add it, tap a chosen
 * one to take it off, or type your own. Chosen ones come first, in the
 * order they were chosen, which is the order the profile shows them.
 */
export function SpecialtyPicker({ value, onChange, disabled }) {
  const [draft, setDraft] = useState('');
  const full = value.length >= SPECIALTIES_MAX;
  const has = (tag) => value.some((v) => v.toLowerCase() === tag.toLowerCase());
  const suggestions = SUGGESTED_SPECIALTIES.filter((tag) => !has(tag));

  function add(tag) {
    const clean = tag.trim().replace(/\s+/g, ' ');
    if (!clean || has(clean) || full) return;
    onChange([...value, clean]);
  }

  function commitDraft() {
    add(draft);
    setDraft('');
  }

  return (
    <div className="specialty-picker">
      {value.length > 0 && (
        <ul className="chef-tags" aria-label="Your specialties">
          {value.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                className="chef-tag chef-tag-chosen"
                onClick={() => onChange(value.filter((v) => v !== tag))}
                disabled={disabled}
                aria-label={`Remove ${tag}`}
              >
                {tag}
                <span className="chef-tag-x">
                  <CloseIcon size={14} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <>
          <ul className="chef-tags" aria-label="Suggestions">
            {suggestions.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className="chef-tag chef-tag-suggestion"
                  onClick={() => add(tag)}
                  disabled={disabled}
                  aria-label={`Add ${tag}`}
                >
                  <span aria-hidden="true">+ </span>
                  {tag}
                </button>
              </li>
            ))}
          </ul>
          <input
            id="profile-specialty"
            className="specialty-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the tag rather than submitting the whole form.
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
            maxLength={SPECIALTY_MAX_LENGTH}
            placeholder="Add your own"
            aria-label="Add a specialty"
            disabled={disabled}
          />
        </>
      )}
      <p className="specialty-count">
        {value.length}/{SPECIALTIES_MAX}
        {full && ' — take one off to add another'}
      </p>
    </div>
  );
}
