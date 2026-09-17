import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { Label, TextInput, TextArea, ErrorText } from './TextField';
import SketchCanvas from './SketchCanvas';
import BubbleSelect from './BubbleSelect';
import IngredientBubbles from './IngredientBubbles';
import { uploadImage, isCloudinaryConfigured } from '../lib/cloudinary';
import './AddMealForm.css';

const DESCRIPTION_MAX = 400;

export default function AddMealForm({ onSave, onCancel }) {
  const [photoMode, setPhotoMode] = useState('upload'); // upload | sketch
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [hasSketch, setHasSketch] = useState(false);
  const sketchRef = useRef(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [methodText, setMethodText] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | uploading | saving | error
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && status !== 'uploading' && status !== 'saving') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onCancel, status]);

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
    photo:
      photoMode === 'sketch'
        ? !hasSketch
          ? 'A sketch is required'
          : ''
        : !photo
        ? 'A photo is required'
        : '',
    name: !name.trim() ? 'A name is required' : '',
    date: !date ? 'A date is required' : '',
    description: !description.trim() ? 'A description is required' : '',
  };
  const isValid = Object.values(errors).every((e) => !e);

  function markTouched(field) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ photo: true, name: true, date: true, description: true });
    if (!isValid) return;

    setSubmitError('');

    let photoUrl = null;
    try {
      const fileToUpload = photoMode === 'sketch' ? await sketchRef.current.getBlob() : photo;
      if (photoMode === 'sketch' && !fileToUpload) {
        throw new Error('Could not read the sketch. Try drawing again.');
      }

      if (isCloudinaryConfigured) {
        setStatus('uploading');
        setUploadProgress(0);
        const uploaded = await uploadImage(fileToUpload, { onProgress: setUploadProgress });
        photoUrl = uploaded.url;
      } else {
        // No Cloudinary configured, fall back to a local object URL so the
        // card still renders a photo for this session (won't persist on reload).
        photoUrl = URL.createObjectURL(fileToUpload);
      }

      setStatus('saving');
      await onSave({
        name: name.trim(),
        date,
        cuisine: cuisine.trim(),
        category: category.trim(),
        description: description.trim(),
        ingredients,
        method: methodText.split('\n').map((s) => s.trim()).filter(Boolean),
        note: note.trim(),
        photoUrl,
      });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setSubmitError(err.message || 'Something went wrong saving this meal.');
    }
  }

  const isSaving = status === 'uploading' || status === 'saving';
  const saveLabel = status === 'uploading' ? `Uploading… ${Math.round(uploadProgress * 100)}%` : status === 'saving' ? 'Saving…' : 'Save meal';

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !isSaving && onCancel()}>
      <div className="add-meal-card" ref={cardRef} role="dialog" aria-modal="true" aria-label="Add a meal">
        <h2 className="add-meal-title">Add a meal</h2>
        <p className="add-meal-subtitle">Only you see this.</p>

        <form className="add-meal-form" onSubmit={handleSubmit} noValidate>
          <div>
            <Label htmlFor="photo" required>
              Photo
            </Label>
            <div className="add-meal-mode-toggle" role="tablist" aria-label="Photo source">
              <button
                type="button"
                role="tab"
                aria-selected={photoMode === 'upload'}
                className={`add-meal-mode-btn ${photoMode === 'upload' ? 'add-meal-mode-btn-active' : ''}`}
                onClick={() => {
                  setPhotoMode('upload');
                  markTouched('photo');
                }}
              >
                Photo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={photoMode === 'sketch'}
                className={`add-meal-mode-btn ${photoMode === 'sketch' ? 'add-meal-mode-btn-active' : ''}`}
                onClick={() => {
                  setPhotoMode('sketch');
                  markTouched('photo');
                }}
              >
                Sketch
              </button>
            </div>
            {photoMode === 'upload' ? (
              <>
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
              </>
            ) : (
              <SketchCanvas
                ref={sketchRef}
                onChange={(drawn) => {
                  setHasSketch(drawn);
                  markTouched('photo');
                }}
              />
            )}
            {touched.photo && <ErrorText>{errors.photo}</ErrorText>}
          </div>

          <div className="add-meal-row">
            <div>
              <Label htmlFor="meal-name" required>
                Meal name
              </Label>
              <TextInput
                id="meal-name"
                placeholder="Meal name (required)"
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

          <div>
            <Label optional>Category</Label>
            <BubbleSelect kind="category" value={category} onChange={setCategory} />
          </div>

          <div>
            <Label optional>Cuisine</Label>
            <BubbleSelect kind="cuisine" value={cuisine} onChange={setCuisine} />
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
            <Label optional>Ingredients</Label>
            <IngredientBubbles value={ingredients} onChange={setIngredients} />
          </div>

          <div>
            <Label htmlFor="meal-method" optional>
              Method, step by step
            </Label>
            <TextArea
              id="meal-method"
              rows={3}
              placeholder="One step per line, numbered automatically"
              value={methodText}
              onChange={(e) => setMethodText(e.target.value)}
            />
            <p className="field-help">Otherwise the card just shows the description.</p>
          </div>

          <div>
            <Label htmlFor="meal-note" optional>
              Note
            </Label>
            <TextInput
              id="meal-note"
              className="add-meal-note-input"
              maxLength={90}
              placeholder="optional note you'd tell future chefs"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {submitError && <ErrorText>{submitError}</ErrorText>}

          <div className="add-meal-footer">
            <Button type="submit" variant="primary" disabled={isSaving}>
              {saveLabel}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
