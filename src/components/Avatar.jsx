import './Avatar.css';

/**
 * A chef's profile picture, or until they've chosen one, the default: a
 * grey figure on a grey disc. Decorative wherever it appears, since the
 * control around it carries the label.
 */
export default function Avatar({ src, size = 36, className = '' }) {
  return (
    <span className={`avatar ${className}`} style={{ '--avatar-size': `${size}px` }} aria-hidden="true">
      {src ? (
        <img className="avatar-image" src={src} alt="" />
      ) : (
        <svg className="avatar-default" viewBox="0 0 40 40">
          <circle cx="20" cy="16" r="7" />
          <ellipse cx="20" cy="38" rx="14" ry="11" />
        </svg>
      )}
    </span>
  );
}
