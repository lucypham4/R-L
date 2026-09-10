import './MealCard.css';

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function formatMealDate(iso) {
  return dateFormatter.format(new Date(iso)).replace(/ /g, ' ').toUpperCase();
}

export default function MealCard({ meal, onOpen }) {
  return (
    <button type="button" className="meal-card" onClick={() => onOpen(meal)}>
      <span className="meal-card-image">
        {meal.photoUrl ? (
          <img src={meal.photoUrl} alt={`${meal.name}, ${meal.cuisine} ${meal.category}`} className="meal-card-photo" />
        ) : (
          <span className="meal-card-image-label" aria-hidden="true">
            food cutout · 1:1
          </span>
        )}
      </span>
      <span className="meal-card-name">{meal.name}</span>
      <span className="meal-card-meta">
        {meal.cuisine} · {meal.category}
      </span>
      <span className="meal-card-date">{formatMealDate(meal.date)}</span>
    </button>
  );
}
