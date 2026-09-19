import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { Label, TextInput, TextArea, ErrorText } from './TextField';
import SketchCanvas from './SketchCanvas';
import PhotoCropModal from './PhotoCropModal';
import PhotoCarousel from './PhotoCarousel';
import BubbleSelect from './BubbleSelect';
import IngredientBubbles from './IngredientBubbles';
import { uploadImage, isCloudinaryConfigured } from '../lib/cloudinary';
import { createSpeechRecognizer, isSpeechRecognitionSupported } from '../lib/speechToText';
import { generateMealDetails, cleanDescription, isAiConfigured } from '../lib/aiFill';
import { loadBubbleList, saveBubbleList } from '../lib/bubbleLists';
import './AddMealForm.css';

const DESCRIPTION_MAX = 400;
const NOTE_MAX = 90;
const MAX_PHOTOS = 6;

function newPhotoId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const STEP_TITLES = {
  1: 'Add a photo',
  2: 'Tell us about it',
  3: 'Your recipe card',
};

const STEP_SUBTITLES = {
  1: 'Only you see this. Crop it however you like.',
  2: '',
  3: '',
};

function ArrowIcon({ direction = 'forward' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === 'forward' ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M19 12H5M11 6l-6 6 6 6" />}
    </svg>
  );
}

export default function AddMealForm({ onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [photoMode, setPhotoMode] = useState('upload'); // upload | sketch
  const [photos, setPhotos] = useState([]); // [{ id, originalFile, file, previewUrl }]
  const [activeIndex, setActiveIndex] = useState(0);
  const [cropTarget, setCropTarget] = useState(null); // { file, index: number | null }
  const [hasSketch, setHasSketch] = useState(false);
  const sketchRef = useRef(null);
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [methodText, setMethodText] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState({});
  const [uploadProgressList, setUploadProgressList] = useState([]);
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

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    },
    [],
  );

  const errors = {
    photo:
      photoMode === 'sketch'
        ? !hasSketch
          ? 'A sketch is required'
          : ''
        : photos.length === 0
        ? 'A photo is required'
        : '',
    notes: !notes.trim() ? 'Tell us a bit about the dish' : '',
    name: !name.trim() ? 'A name is required' : '',
    date: !date ? 'A date is required' : '',
    description: !description.trim() ? 'A description is required' : '',
  };

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
        setNotes(`${dictationBaseRef.current}${transcript}`);
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
    dictationBaseRef.current = notes.trim() ? `${notes.trim()} ` : '';
    recognizerRef.current = recognizer;
    recognizer.start();
    setIsListening(true);
    markTouched('notes');
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

  function handleCropConfirm(blob) {
    const file = new File([blob], 'meal-photo.jpg', { type: 'image/jpeg' });
    const previewUrl = URL.createObjectURL(blob);
    if (cropTarget.index === null) {
      setPhotos([...photos, { id: newPhotoId(), originalFile: cropTarget.file, file, previewUrl }]);
      setActiveIndex(photos.length);
    } else {
      const next = [...photos];
      if (next[cropTarget.index]?.previewUrl) URL.revokeObjectURL(next[cropTarget.index].previewUrl);
      next[cropTarget.index] = { ...next[cropTarget.index], file, previewUrl };
      setPhotos(next);
      setActiveIndex(cropTarget.index);
    }
    setCropTarget(null);
    markTouched('photo');
  }

  function handleRemovePhoto(index) {
    const removed = photos[index];
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    setActiveIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
  }

  function handleAdvanceStep1() {
    markTouched('photo');
    if (errors.photo) return;
    setStep(2);
  }

  async function handleAdvanceStep2() {
    markTouched('notes');
    if (errors.notes) return;

    if (!isAiConfigured) {
      setDescription(notes.trim().slice(0, DESCRIPTION_MAX));
      setStep(3);
      return;
    }

    setAiFillError('');
    setAiFillStatus('loading');
    try {
      const photoBlob = photoMode === 'sketch' ? await sketchRef.current.getBlob() : photos[0]?.file;
      if (!photoBlob) throw new Error('Add a photo or sketch first.');
      const photoMediaType = photoMode === 'sketch' ? 'image/png' : 'image/jpeg';

      const details = await generateMealDetails({
        notes: notes.trim(),
        photoBlob,
        photoMediaType,
      });

      if (details.name) setName(details.name);
      if (details.date) setDate(details.date);
      setDescription((details.description || notes.trim()).slice(0, DESCRIPTION_MAX));
      if (details.category) applyBubbleValue('category', details.category, setCategory);
      if (details.cuisine) applyBubbleValue('cuisine', details.cuisine, setCuisine);
      if (details.ingredients.length) setIngredients(details.ingredients);
      if (details.method.length) setMethodText(details.method.join('\n'));
      if (details.note) setNote(details.note.slice(0, NOTE_MAX));

      setAiFillStatus('done');
      setStep(3);
    } catch (err) {
      setAiFillStatus('error');
      setAiFillError(err.message || 'Could not fill in details. You can still write the card yourself.');
    }
  }

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

  const canCleanDescription = isAiConfigured && description.trim().length > 0 && cleanupStatus !== 'loading';

  async function uploadOnePhoto(file, index) {
    if (isCloudinaryConfigured) {
      const uploaded = await uploadImage(file, {
        onProgress: (p) =>
          setUploadProgressList((list) => {
            const next = [...list];
            next[index] = p;
            return next;
          }),
      });
      return uploaded.url;
    }
    // No Cloudinary configured, fall back to a local object URL so the
    // card still renders a photo for this session (won't persist on reload).
    return URL.createObjectURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched((t) => ({ ...t, name: true, date: true, description: true }));
    if (errors.name || errors.date || errors.description) return;

    setSubmitError('');

    try {
      let photoUrls;
      if (photoMode === 'sketch') {
        const blob = await sketchRef.current.getBlob();
        if (!blob) throw new Error('Could not read the sketch. Try drawing again.');
        setStatus('uploading');
        setUploadProgressList([0]);
        photoUrls = [await uploadOnePhoto(new File([blob], 'meal-sketch.png', { type: 'image/png' }), 0)];
      } else {
        setStatus('uploading');
        setUploadProgressList(photos.map(() => 0));
        photoUrls = await Promise.all(photos.map((p, i) => uploadOnePhoto(p.file, i)));
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
        photos: photoUrls,
      });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setSubmitError(err.message || 'Something went wrong saving this meal.');
    }
  }

  const uploadProgress = uploadProgressList.length
    ? uploadProgressList.reduce((sum, p) => sum + p, 0) / uploadProgressList.length
    : 0;
  const isSaving = status === 'uploading' || status === 'saving';
  const saveLabel = status === 'uploading' ? `Uploading… ${Math.round(uploadProgress * 100)}%` : status === 'saving' ? 'Saving…' : 'Save meal';

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !isSaving && onCancel()}>
      <div className="add-meal-card" ref={cardRef} role="dialog" aria-modal="true" aria-label="Add a meal">
        <p className="add-meal-progress">Step {step} of 3</p>
        <h2 className="add-meal-title">{STEP_TITLES[step]}</h2>
        {STEP_SUBTITLES[step] && <p className="add-meal-subtitle">{STEP_SUBTITLES[step]}</p>}

        {step === 1 && (
          <div className="add-meal-form">
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
                  {photos.length === 0 ? (
                    <div
                      className="add-meal-dropzone"
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                      }}
                    >
                      <p>Drop a background-removed PNG</p>
                      <p className="add-meal-dropzone-hint">or click to browse, crop it right here</p>
                    </div>
                  ) : (
                    <>
                      <PhotoCarousel
                        photos={photos.map((p) => ({ id: p.id, src: p.previewUrl }))}
                        activeIndex={activeIndex}
                        onActiveChange={setActiveIndex}
                        onRemove={handleRemovePhoto}
                        onAdd={() => fileInputRef.current?.click()}
                        maxPhotos={MAX_PHOTOS}
                        alt="Uploaded dish photo"
                      />
                      <button
                        type="button"
                        className="add-meal-adjust-crop"
                        onClick={() => setCropTarget({ file: photos[activeIndex].originalFile, index: activeIndex })}
                      >
                        Adjust crop
                      </button>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    id="photo"
                    type="file"
                    accept="image/png,image/jpeg"
                    className="visually-hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file) setCropTarget({ file, index: null });
                      e.target.value = '';
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

            <div className="add-meal-footer">
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" variant="primary" className="add-meal-next" onClick={handleAdvanceStep1}>
                Next <ArrowIcon />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="add-meal-form">
            {photos.length > 0 && (
              <div className="add-meal-context-photo-row">
                <img src={photos[0].previewUrl} alt="" className="add-meal-context-photo" />
                <button type="button" className="add-meal-adjust-crop" onClick={() => setStep(1)}>
                  Change photo
                </button>
              </div>
            )}

            <div>
              <div className="add-meal-label-row">
                <Label htmlFor="meal-notes" required>
                  About this dish
                </Label>
                {isSpeechRecognitionSupported() && (
                  <button
                    type="button"
                    className={`add-meal-inline-btn ${isListening ? 'add-meal-inline-btn-active' : ''}`}
                    onClick={toggleListening}
                    aria-pressed={isListening}
                    aria-label={isListening ? 'Stop dictating' : 'Dictate notes'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                    </svg>
                    {isListening ? 'Stop' : 'Speak'}
                  </button>
                )}
              </div>
              <TextArea
                id="meal-notes"
                rows={8}
                className="add-meal-notes-textarea"
                placeholder="Meal name, when you cooked it, cuisine, category, ingredients, anything that'll help fill out the rest. No limit, ramble away."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => markTouched('notes')}
                error={touched.notes && errors.notes}
              />
              {speechError && <ErrorText>{speechError}</ErrorText>}
              {touched.notes && <ErrorText>{errors.notes}</ErrorText>}
              {aiFillStatus === 'error' && <ErrorText>{aiFillError}</ErrorText>}
            </div>

            <div className="add-meal-footer">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                <ArrowIcon direction="back" /> Back
              </Button>
              <Button
                type="button"
                variant="primary"
                className="add-meal-next"
                onClick={handleAdvanceStep2}
                disabled={aiFillStatus === 'loading'}
              >
                {aiFillStatus === 'loading' ? (
                  'Filling in…'
                ) : (
                  <>
                    Next <ArrowIcon />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form className="add-meal-form" onSubmit={handleSubmit} noValidate>
            <div>
              <div className="add-meal-label-row">
                <Label htmlFor="meal-description" required>
                  Description
                </Label>
                {isAiConfigured && (
                  <div className="add-meal-label-actions">
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
                  </div>
                )}
              </div>
              <TextArea
                id="meal-description"
                rows={3}
                maxLength={DESCRIPTION_MAX}
                placeholder="What is this dish?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => markTouched('description')}
                error={touched.description && errors.description}
              />
              <div className="add-meal-counter">
                {description.length} / {DESCRIPTION_MAX}
              </div>
              {cleanupStatus === 'error' && <ErrorText>{cleanupError}</ErrorText>}
              {touched.description && <ErrorText>{errors.description}</ErrorText>}
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
              <Button type="button" variant="secondary" onClick={() => setStep(2)} disabled={isSaving}>
                <ArrowIcon direction="back" /> Back
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {saveLabel}
              </Button>
            </div>
          </form>
        )}
      </div>

      {cropTarget && (
        <PhotoCropModal file={cropTarget.file} onCancel={() => setCropTarget(null)} onCrop={handleCropConfirm} />
      )}
    </div>
  );
}
