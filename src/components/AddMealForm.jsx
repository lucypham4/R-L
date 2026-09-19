import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { Label, TextInput, TextArea, ErrorText } from './TextField';
import SketchCanvas from './SketchCanvas';
import BubbleSelect from './BubbleSelect';
import IngredientBubbles from './IngredientBubbles';
import { uploadImage, isCloudinaryConfigured } from '../lib/cloudinary';
import { createSpeechRecognizer, isSpeechRecognitionSupported } from '../lib/speechToText';
import { generateMealDetails, cleanDescription, isAiConfigured } from '../lib/aiFill';
import { loadBubbleList, saveBubbleList } from '../lib/bubbleLists';
import './AddMealForm.css';

const DESCRIPTION_MAX = 400;
const NOTE_MAX = 90;

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
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [isListeningMethod, setIsListeningMethod] = useState(false);
  const [methodSpeechError, setMethodSpeechError] = useState('');
  const [aiFillStatus, setAiFillStatus] = useState('idle'); // idle | loading | done | error
  const [aiFillError, setAiFillError] = useState('');
  const [cleanupStatus, setCleanupStatus] = useState('idle'); // idle | loading | done | error
  const [cleanupError, setCleanupError] = useState('');
  const fileInputRef = useRef(null);
  const cardRef = useRef(null);
  const recognizerRef = useRef(null);
  const dictationBaseRef = useRef('');
  const methodRecognizerRef = useRef(null);
  const methodDictationBaseRef = useRef('');

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

  useEffect(() => () => {
    recognizerRef.current?.stop();
    methodRecognizerRef.current?.stop();
  }, []);

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

  function toggleListening() {
    if (isListening) {
      recognizerRef.current?.stop();
      return;
    }
    setSpeechError('');
    const recognizer = createSpeechRecognizer({
      onResult: (transcript) => {
        setDescription(`${dictationBaseRef.current}${transcript}`.slice(0, DESCRIPTION_MAX));
      },
      onError: (code) => {
        setSpeechError(code === 'not-allowed' ? 'Microphone access was denied.' : 'Speech recognition failed. Try again.');
        setIsListening(false);
      },
      onEnd: () => setIsListening(false),
    });
    if (!recognizer) {
      setSpeechError('Speech recognition is not supported in this browser.');
      return;
    }
    dictationBaseRef.current = description.trim() ? `${description.trim()} ` : '';
    recognizerRef.current = recognizer;
    recognizer.start();
    setIsListening(true);
    markTouched('description');
  }

  // Turns a run-on spoken transcript into one line per sentence, so
  // dictated method steps land in the "one step per line" format the
  // field expects instead of one unbroken block of text.
  function splitIntoSteps(transcript) {
    return transcript
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
  }

  function toggleMethodListening() {
    if (isListeningMethod) {
      methodRecognizerRef.current?.stop();
      return;
    }
    setMethodSpeechError('');
    const recognizer = createSpeechRecognizer({
      onResult: (transcript) => {
        setMethodText(`${methodDictationBaseRef.current}${splitIntoSteps(transcript)}`);
      },
      onError: (code) => {
        setMethodSpeechError(code === 'not-allowed' ? 'Microphone access was denied.' : 'Speech recognition failed. Try again.');
        setIsListeningMethod(false);
      },
      onEnd: () => setIsListeningMethod(false),
    });
    if (!recognizer) {
      setMethodSpeechError('Speech recognition is not supported in this browser.');
      return;
    }
    methodDictationBaseRef.current = methodText.trim() ? `${methodText.trim()}\n` : '';
    methodRecognizerRef.current = recognizer;
    recognizer.start();
    setIsListeningMethod(true);
  }

  // Persists a newly-suggested value into its bubble list (if it isn't
  // already there) before setting it, then forces BubbleSelect to remount
  // via the `key` prop below so it reloads the list and shows it selected.
  function applyBubbleValue(kind, value, setter) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const list = loadBubbleList(kind);
    if (!list.includes(trimmed)) saveBubbleList(kind, [...list, trimmed]);
    setter(trimmed);
  }

  async function handleAiFill() {
    setAiFillError('');
    setAiFillStatus('loading');
    try {
      const photoBlob = photoMode === 'sketch' ? await sketchRef.current.getBlob() : photo;
      if (!photoBlob) throw new Error('Add a photo or sketch first.');
      const photoMediaType = photoMode === 'sketch' ? 'image/png' : photo?.type || 'image/png';

      const details = await generateMealDetails({
        description: description.trim(),
        photoBlob,
        photoMediaType,
      });

      if (!name.trim() && details.name) setName(details.name);
      if (details.category) applyBubbleValue('category', details.category, setCategory);
      if (details.cuisine) applyBubbleValue('cuisine', details.cuisine, setCuisine);
      if (details.ingredients.length) {
        setIngredients((prev) => [...prev, ...details.ingredients.filter((item) => !prev.includes(item))]);
      }
      if (!methodText.trim() && details.method.length) setMethodText(details.method.join('\n'));
      if (!note.trim() && details.note) setNote(details.note.slice(0, NOTE_MAX));

      setAiFillStatus('done');
    } catch (err) {
      setAiFillStatus('error');
      setAiFillError(err.message || 'Could not fill in details. Fill them in yourself instead.');
    }
  }

  const canAiFill =
    isAiConfigured &&
    (photoMode === 'sketch' ? hasSketch : Boolean(photo)) &&
    description.trim().length > 0 &&
    aiFillStatus !== 'loading';

  async function handleCleanDescription() {
    setCleanupError('');
    setCleanupStatus('loading');
    try {
      const cleaned = await cleanDescription({ description: description.trim() });
      setDescription(cleaned.slice(0, DESCRIPTION_MAX));
      setCleanupStatus('done');
    } catch (err) {
      setCleanupStatus('error');
      setCleanupError(err.message || 'Could not clean up the description.');
    }
  }

  const canCleanDescription = isAiConfigured && description.trim().length > 0 && !isListening && cleanupStatus !== 'loading';

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

          <div>
            <div className="add-meal-label-row">
              <Label htmlFor="meal-description" required>
                Description
              </Label>
              <div className="add-meal-label-actions">
                {isSpeechRecognitionSupported() && (
                  <button
                    type="button"
                    className={`add-meal-inline-btn ${isListening ? 'add-meal-inline-btn-active' : ''}`}
                    onClick={toggleListening}
                    aria-pressed={isListening}
                    aria-label={isListening ? 'Stop dictating' : 'Dictate description'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                    </svg>
                    {isListening ? 'Stop' : 'Speak'}
                  </button>
                )}
                {isAiConfigured && (
                  <button
                    type="button"
                    className="add-meal-inline-btn"
                    onClick={handleCleanDescription}
                    disabled={!canCleanDescription}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    {cleanupStatus === 'loading' ? 'Cleaning…' : 'Clean up'}
                  </button>
                )}
              </div>
            </div>
            <p className="field-help">Add any additional details about your dish. A quick, spoken sentence or two is plenty.</p>
            <TextArea
              id="meal-description"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              placeholder="What did you make? e.g. 'Pan-seared salmon with a lemon butter sauce and asparagus'"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => markTouched('description')}
              error={touched.description && errors.description}
            />
            <div className="add-meal-counter">
              {description.length} / {DESCRIPTION_MAX}
            </div>
            {speechError && <ErrorText>{speechError}</ErrorText>}
            {cleanupStatus === 'error' && <ErrorText>{cleanupError}</ErrorText>}
            {touched.description && <ErrorText>{errors.description}</ErrorText>}

            {isAiConfigured && (
              <div className="add-meal-ai-fill">
                <Button type="button" variant="secondary" onClick={handleAiFill} disabled={!canAiFill}>
                  {aiFillStatus === 'loading' ? 'Filling in…' : 'Fill in details'}
                </Button>
                {aiFillStatus === 'loading' && (
                  <p className="field-help">Looking at the photo and description…</p>
                )}
                {aiFillStatus === 'done' && (
                  <p className="add-meal-status-note">Filled in what it could, worth a once-over below.</p>
                )}
                {aiFillStatus === 'error' && <ErrorText>{aiFillError}</ErrorText>}
              </div>
            )}
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
            <BubbleSelect key={category} kind="category" value={category} onChange={setCategory} />
          </div>

          <div>
            <Label optional>Cuisine</Label>
            <BubbleSelect key={cuisine} kind="cuisine" value={cuisine} onChange={setCuisine} />
          </div>

          <div>
            <Label optional>Ingredients</Label>
            <IngredientBubbles value={ingredients} onChange={setIngredients} />
          </div>

          <div>
            <div className="add-meal-label-row">
              <Label htmlFor="meal-method" optional>
                Method, step by step
              </Label>
              {isSpeechRecognitionSupported() && (
                <button
                  type="button"
                  className={`add-meal-inline-btn ${isListeningMethod ? 'add-meal-inline-btn-active' : ''}`}
                  onClick={toggleMethodListening}
                  aria-pressed={isListeningMethod}
                  aria-label={isListeningMethod ? 'Stop dictating method' : 'Dictate method'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                  {isListeningMethod ? 'Stop' : 'Speak'}
                </button>
              )}
            </div>
            <TextArea
              id="meal-method"
              rows={3}
              placeholder="One step per line, numbered automatically"
              value={methodText}
              onChange={(e) => setMethodText(e.target.value)}
            />
            {methodSpeechError && <ErrorText>{methodSpeechError}</ErrorText>}
            <p className="field-help">Speak a step at a time, or run it all together, sentences become steps. Otherwise the card just shows the description.</p>
          </div>

          <div>
            <Label htmlFor="meal-note" optional>
              Note
            </Label>
            <TextInput
              id="meal-note"
              className="add-meal-note-input"
              maxLength={NOTE_MAX}
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
