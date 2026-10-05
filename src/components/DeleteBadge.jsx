import CloseIcon from './CloseIcon';
import './DeleteBadge.css';

// The × that hangs off the corner of a photo to delete what the photo
// belongs to: a dish in the gallery's edit mode, a photo in the add-meal
// carousel. It's one badge in both so the two read as the same thing; each
// caller passes a class that says where it hangs.
export default function DeleteBadge({ label, onClick, className = '' }) {
  return (
    <button type="button" className={`delete-badge ${className}`} aria-label={label} onClick={onClick}>
      <CloseIcon size={16} />
    </button>
  );
}
