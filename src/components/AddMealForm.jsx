import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { Label, TextInput, TextArea, ErrorText } from './TextField';
import Tag from './Tag';
import './AddMealForm.css';

const DESCRIPTION_MAX = 400;

export default function AddMealForm({ cuisines, categories, onSave, onCancel }) {
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [methodText, setMethodText] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [touched, setTouched] = useState({});
  const fileInputRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onCancel]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const errors = {
    photo: !photo ? 'A photo is required' : '',
    name: !name.trim() ? 'A name is required' : '',
    date: !date ? 'A date is required' : '',
    description: !description.trim() ? 'A description is required' : '',
  };
  const isValid = Object.values(errors).every((e) => !e);

  function markTouched(field) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function addTag() {
    const value = tagDraft.trim();
    if (value && !tags.includes(value)) {
      setTags([...tags, value]);
    }
    setTagDraft('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTouched({ photo: true, name: true, date: true, description: true });
    if (!isValid) return;

    onSave({
      name: name.trim(),
      date,
      cuisine: cuisine.trim(),
      category: category.trim(),
      description: description.trim(),
      ingredients: ingredientsText.split('\n').map((s) => s.trim()).filter(Boolean),
      method: methodText.split('\n').map((s) => s.trim()).filter(Boolean),
      note: note.trim(),
      tags,
      photoPreview,
    });
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="add-meal-card" ref={cardRef} role="dialog" aria-modal="true" aria-label="Add a meal">
        <h2 className="add-meal-title">Add a meal</h2>
        <p className="add-meal-subtitle">Only Lucy sees this.</p>

        <form className="add-meal-form" onSubmit={handleSubmit} noValidate>
          <div>
            <Label htmlFor="photo" required>
              Photo
            </Label>
            <div
              className="add-meal-dropzone"
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="" className="add-meal-preview" />
              ) : (
                <>
                  <p>Drop a background-removed PNG</p>
                  <p className="add-meal-dropzone-hint">or click to browse · square crop, ≥1400px</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="photo"
              type="file"
              accept="image/png,image/jpeg"
              className="visually-hidden"
              onChange={(e) => {
                setPhoto(e.target.files?.[0] ?? null);
                markTouched('photo');
              }}
            />
            {touched.photo && <ErrorText>{errors.photo}</ErrorText>}
          </div>

          <div className="add-meal-row">
            <div>
              <Label htmlFor="meal-name" required>
                Meal name
              </Label>
              <TextInput
                id="meal-name"
                placeholder="Miso-glazed aubergine"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => markTouched('name')}
                error={touched.name && errors.name}
              />
              {touched.name && <ErrorText>{errors.name}</ErrorText>}
            </div>
            <div>
              <Label htmlFor="meal-date" required>
                Date cooked
              </Label>
              <TextInput
                id="meal-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onBlur={() => markTouched('date')}
                error={touched.date && errors.date}
              />
              {touched.date && <ErrorText>{errors.date}</ErrorText>}
            </div>
          </div>

          <div className="add-meal-row">
            <div>
              <Label htmlFor="meal-cuisine" optional>
                Cuisine
              </Label>
              <TextInput
                id="meal-cuisine"
                list="cuisine-options"
                placeholder="Select cuisine"
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
              />
              <datalist id="cuisine-options">
                {cuisines.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="meal-category" optional>
                Category
              </Label>
              <TextInput
                id="meal-category"
                list="category-options"
                placeholder="Select category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <Label htmlFor="meal-description" required>
              Description
            </Label>
            <TextArea
              id="meal-description"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => markTouched('description')}
              error={touched.description && errors.description}
            />
            <div className="add-meal-counter">
              {description.length} / {DESCRIPTION_MAX}
            </div>
            {touched.description && <ErrorText>{errors.description}</ErrorText>}
          </div>

          <div>
            <Label htmlFor="meal-ingredients" optional>
              Ingredients
            </Label>
            <TextArea
              id="meal-ingredients"
              rows={3}
              placeholder="One per line"
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="meal-method" optional>
              Method, step by step
            </Label>
            <TextArea
              id="meal-method"
              rows={3}
              placeholder="One step per line — numbered automatically on the card"
              value={methodText}
              onChange={(e) => setMethodText(e.target.value)}
            />
            <p className="field-help">Left blank, the recipe card prints the description alone and drops the numbered block.</p>
          </div>

          <div>
            <Label htmlFor="meal-note" optional>
              Note
            </Label>
            <TextInput
              id="meal-note"
              className="add-meal-note-input"
              maxLength={90}
              placeholder="grill was too hot — 10 min next time"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="field-help">
              The margin note, printed in italic and tilted on the card, the way a correction gets scribbled on a recipe after
              cooking it. One line, 90 characters.
            </p>
          </div>

          <div>
            <Label optional>Tags</Label>
            <div className="add-meal-tags">
              {tags.map((tag) => (
                <Tag key={tag} removable onRemove={() => setTags(tags.filter((t) => t !== tag))}>
                  {tag}
                </Tag>
              ))}
              <input
                className="add-meal-tag-input"
                placeholder="Add tag…"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
              />
            </div>
          </div>

          <div className="add-meal-footer">
            <Button type="submit" variant="primary">
              Save meal
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
