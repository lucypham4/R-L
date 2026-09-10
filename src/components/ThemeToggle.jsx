import './ThemeToggle.css';

export default function ThemeToggle({ theme, onToggle }) {
  return (
    <button type="button" className="theme-toggle" onClick={onToggle}>
      <span className="theme-toggle-dot" aria-hidden="true" />
      {theme === 'dark' ? 'Dark' : 'Light'}
    </button>
  );
}
