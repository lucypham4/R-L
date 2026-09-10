import './MealCard.css';

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function formatMealDate(iso) {
  return dateFormatter.format(new Date(iso)).replace(/ /g, ' ').toUpperCase();
}

export default function MealCard({ meal, onOpen }) {
  return (
    <button type="button" className="meal-card" onClick={() => onOpen(meal)}>
      <span className="meal-card-image" aria-hidden="true">
        <span className="meal-card-image-label">food cutout · 1:1</span>
      </span>
      <span className="meal-card-name">{meal.name}</span>
      <span className="meal-card-meta">
        {meal.cuisine} · {meal.category}
      </span>
      <span className="meal-card-date">{formatMealDate(meal.date)}</span>
    </button>
  );
}
