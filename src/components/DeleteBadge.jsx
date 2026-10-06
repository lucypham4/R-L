import CloseIcon from './CloseIcon';
import './DeleteBadge.css';

// The × that hangs off the corner of a photo to delete what the photo
// belongs to: a dish in the gallery's edit mode, a photo in the add-meal
// carousel. It's one badge in both so the two read as the same thing; each
// caller passes a class that says where it hangs. `small` is the same badge
// for a small photo, where the full size would cover a quarter of it.
export default function DeleteBadge({ label, onClick, className = '', small = false }) {
  return (
    <button
      type="button"
      className={`delete-badge ${small ? 'delete-badge-small' : ''} ${className}`}
      aria-label={label}
      onClick={onClick}
    >
      <CloseIcon size={small ? 12 : 16} />
    </button>
  );
}
