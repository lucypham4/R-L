import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import SegmentedToggle from './SegmentedToggle';
import { Label, TextInput, TextArea, ErrorText } from './TextField';
import SketchCanvas from './SketchCanvas';
import PhotoCropModal from './PhotoCropModal';
import PhotoCarousel from './PhotoCarousel';
import BubbleSelect from './BubbleSelect';
import IngredientBubbles from './IngredientBubbles';
import { uploadImage, isCloudinaryConfigured } from '../lib/cloudinary';
import { createSpeechRecognizer, isSpeechRecognitionSupported } from '../lib/speechToText';
import { generateMealDetails, cleanDescription, isAiConfigured, isBusyFailure } from '../lib/aiFill';
import { loadBubbleList, saveBubbleList } from '../lib/bubbleLists';
import { DEFAULT_SERVES, SUMMARY_MAX, normaliseServes } from '../lib/meal';
import './AddMealForm.css';

const DESCRIPTION_MAX = 400;
const NOTE_MAX = 90;
const MAX_PHOTOS = 6;
const SERVES_MIN = 1;
const SERVES_MAX = 99;

/**
 * A number input hands back a string, and an empty one hands back ''. Blank
 * is allowed (the card then says nothing about serves), but anything typed
 * has to be a count the card could print honestly.
 */
function servesError(value) {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return 'Use a whole number';
  if (n < SERVES_MIN || n > SERVES_MAX) return `Between ${SERVES_MIN} and ${SERVES_MAX}`;
  return '';
}

function newPhotoId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The fields the AI fill writes, in the order they sit on the card. Serves
// isn't one: the AI is never asked. While an answer is on its way each of
// these shows the sheen (Filling, below), and each stops as its own content
// arrives.
const AI_FIELDS = ['description', 'summary', 'name', 'date', 'category', 'cuisine', 'ingredients', 'method', 'note'];

/**
 * A control waiting on the AI. While `field` is pending the Staj sheen runs
 * across a skeleton over it (.sheen-fill, global.css) and it takes no input,
 * since the answer would overwrite whatever was typed; the moment it
 * leaves `pending` the skeleton fades away.
 */
function Filling({ field, pending, children }) {
  const active = pending.has(field);
  return (
    <div
      className={`sheen-fill${active ? ' sheen-fill-active' : ''}`}
      style={{ '--sheen-i': AI_FIELDS.indexOf(field) }}
      aria-busy={active || undefined}
      // React 18 only passes `inert` through as a string attribute.
      {...(active ? { inert: '' } : {})}
    >
      {children}
    </div>
  );
}

const STEP_TITLES = {
  1: 'Add a photo',
  2: 'Tell us about it',
  3: 'Your recipe card',
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
  // SketchCanvas only renders on step 1, so sketchRef.current is null from
  // step 2 onward. Both the AI-fill call and the save need the drawing after
  // that point, so the blob is captured on the way out of step 1 and kept
  // here. Without it, sketch meals threw "Cannot read properties of null
  // (reading 'getBlob')" and could never be saved.
  const sketchBlobRef = useRef(null);
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  // Pre-filled rather than blank: 2 was what every meal silently claimed
  // before this field existed, and it's the common case. The difference is
  // that a chef now sees it and can change it, or clear it to say nothing.
  const [serves, setServes] = useState(String(DEFAULT_SERVES));
  const [cuisine, setCuisine] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  // The line on the dish's resting card. Written by the AI fill when it
  // runs; left blank, the card makes one from the description (summaryOf).
  const [summary, setSummary] = useState('');
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
  // `retrying` is the automatic second try on step 2, after a 503 or 429.
  const [aiFillStatus, setAiFillStatus] = useState('idle'); // idle | loading | retrying | done | error
  const [aiFillError, setAiFillError] = useState('');
  // Which of AI_FIELDS are still waiting on the answer. A field leaves the
  // set when its content arrives, so the sheen stops field by field.
  const [aiPending, setAiPending] = useState(() => new Set());
  // Bumped whenever a fill starts or is abandoned (Back), so an answer that
  // arrives for an earlier run is dropped instead of overwriting the chef.
  const aiRunRef = useRef(0);
  const [isRetryingAiFill, setIsRetryingAiFill] = useState(false);
  // Set when "Try again" fails: the card as it stood then, and whether the
  // model was busy. The line under the button shows only while the card still
  // matches that signature (see below).
  const [retryFailure, setRetryFailure] = useState(null); // { signature, busy }
  const [cleanupStatus, setCleanupStatus] = useState('idle'); // idle | loading | done | error
  const [cleanupError, setCleanupError] = useState('');
  const [cleanupBusy, setCleanupBusy] = useState(false);
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

  // What the AI fill writes, as the form holds it right now. A retry lands
  // seconds after it was asked for, so it reads this when it arrives rather
  // than the values its click handler closed over, which the chef may have
  // typed over since.
  const filledFieldsRef = useRef({});
  filledFieldsRef.current = { name, date, description, summary, category, cuisine, ingredients, method: methodText, note };
  // The same fields as they stood when the AI fill last failed (with the
  // notes carried over as the description). A field still equal to its entry
  // here is one the chef hasn't touched since.
  const failedFillSnapshotRef = useRef(null);

  // Every field on step 3 as one comparable string, so "has the chef changed
  // anything?" is a single check, whichever input or bubble they used and
  // however (typing, dictation, picking a bubble).
  const cardSignature = JSON.stringify([name, date, serves, description, summary, category, cuisine, ingredients, methodText, note]);
  const cardSignatureRef = useRef(cardSignature);
  cardSignatureRef.current = cardSignature;
  // Any edit retires the line under the button: it was about the card as it was.
  useEffect(() => {
    setRetryFailure((shown) => (shown !== null && shown.signature !== cardSignature ? null : shown));
  }, [cardSignature]);

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
    serves: servesError(serves),
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

  async function getSketchBlob() {
    if (sketchRef.current) {
      const blob = await sketchRef.current.getBlob();
      if (blob) sketchBlobRef.current = blob;
      return blob;
    }
    return sketchBlobRef.current;
  }

  async function handleAdvanceStep1() {
    markTouched('photo');
    if (errors.photo) return;
    // Capture the drawing before the canvas unmounts with this step.
    if (photoMode === 'sketch') await getSketchBlob();
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

    // On to the card at once: its fields wait for the AI where the chef can
    // see them (Filling), instead of the Next button holding them on this
    // step until the answer is in.
    const run = ++aiRunRef.current;
    const isCurrent = () => aiRunRef.current === run;
    const arrived = (field) =>
      setAiPending((pending) => {
        const next = new Set(pending);
        next.delete(field);
        return next;
      });

    setAiFillError('');
    setAiFillStatus('loading');
    setAiPending(new Set(AI_FIELDS));
    setStep(3);
    try {
      const details = await requestAiDetails({
        // Still on step 3 and still shimmering; the status line says why it's
        // taking a moment longer.
        onRetry: () => isCurrent() && setAiFillStatus('retrying'),
      });
      if (!isCurrent()) return;

      // One answer carries every field, so they all land together; each is
      // taken out of `pending` as it is applied, which is what lets a field
      // stop on its own if the answer ever arrives in pieces.
      applyAiDetails(details, undefined, arrived);
      setAiFillStatus('done');
    } catch (err) {
      if (!isCurrent()) return;
      // AI fill is an enrichment, never a gate. It used to leave the chef
      // stuck on step 2 with a status-code string and no way forward, which
      // meant a failing Edge Function blocked saving a meal at all. Carry
      // the notes across as the description (exactly what the no-AI path
      // does) and let them finish the card by hand; a notice on step 3 says
      // so, and offers another go, rather than leaving a dead end.
      //
      // The reason stays out of the notice's body (a status-code and a blob
      // of JSON help nobody mid-recipe): it goes to the console, and sits
      // behind the notice's Details for anyone who wants it.
      console.error('AI fill failed:', err);
      const carriedDescription = filledFieldsRef.current.description || notes.trim().slice(0, DESCRIPTION_MAX);
      failedFillSnapshotRef.current = { ...filledFieldsRef.current, description: carriedDescription };
      setAiFillStatus('error');
      setAiFillError(err.message || "Couldn't reach the AI just now.");
      setDescription(carriedDescription);
      setAiPending(new Set());
    }
  }

  // Back from the card while the AI is still answering: abandon that
  // answer, so it can't land on top of whatever the chef does next.
  function handleBackToNotes() {
    aiRunRef.current += 1;
    setAiPending(new Set());
    setAiFillStatus('idle');
    setStep(2);
  }

  async function requestAiDetails({ onRetry } = {}) {
    const photoBlob = photoMode === 'sketch' ? await getSketchBlob() : photos[0]?.file;
    if (!photoBlob) throw new Error('Add a photo or sketch first.');
    const photoMediaType = photoMode === 'sketch' ? 'image/png' : 'image/jpeg';

    return generateMealDetails({
      notes: notes.trim(),
      photoBlob,
      photoMediaType,
      onRetry,
    });
  }

  // Writes the AI's answer into the form, field by field in the order they
  // sit on the card. `isFree` says whether a field may be overwritten (the
  // first fill passes nothing, so every field is); `onApplied` is told as each
  // field has been dealt with, which is how the card stops that field's sheen.
  function applyAiDetails(details, isFree = () => true, onApplied) {
    const fills = {
      description: () => isFree('description') && setDescription((details.description || notes.trim()).slice(0, DESCRIPTION_MAX)),
      summary: () => details.summary && isFree('summary') && setSummary(details.summary),
      name: () => details.name && isFree('name') && setName(details.name),
      date: () => details.date && isFree('date') && setDate(details.date),
      category: () => details.category && isFree('category') && applyBubbleValue('category', details.category, setCategory),
      cuisine: () => details.cuisine && isFree('cuisine') && applyBubbleValue('cuisine', details.cuisine, setCuisine),
      ingredients: () => details.ingredients.length && isFree('ingredients') && setIngredients(details.ingredients),
      method: () => details.method.length && isFree('method') && setMethodText(details.method.join('\n')),
      note: () => details.note && isFree('note') && setNote(details.note.slice(0, NOTE_MAX)),
    };
    for (const field of AI_FIELDS) {
      fills[field]();
      onApplied?.(field);
    }
  }

  // "Try again" on the failure notice: the same photo and notes as before
  // (neither can change from step 3), filling only what the chef hasn't
  // written themselves since it failed. Fields are compared with the failure
  // snapshot after the answer arrives, so something typed while it was
  // thinking counts too. Equal-by-value on purpose: ingredients, category and
  // cuisine change through child components, and dictation sets text with no
  // onChange to hook, so a per-field "edited" flag would miss some of them.
  //
  // Unlike the first fill this doesn't lock the card or shimmer: the chef is
  // already holding a card they can finish by hand, and may be doing it.
  async function handleRetryAiFill() {
    const snapshot = failedFillSnapshotRef.current;
    if (!snapshot || isRetryingAiFill) return;
    setRetryFailure(null);
    setIsRetryingAiFill(true);
    try {
      const details = await requestAiDetails();
      const current = filledFieldsRef.current;
      applyAiDetails(details, (field) => JSON.stringify(current[field]) === JSON.stringify(snapshot[field]));

      failedFillSnapshotRef.current = null;
      setAiFillError('');
      setAiFillStatus('done');
    } catch (err) {
      console.error('AI fill retry failed:', err);
      setAiFillError(err.message || "Couldn't reach the AI just now.");
      // Read after the await, so something typed while it ran is already
      // part of the card this line is about.
      setRetryFailure({ signature: cardSignatureRef.current, busy: isBusyFailure(err) });
    } finally {
      setIsRetryingAiFill(false);
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
      // The chef gets a plain line; the model's own words (Gemini's JSON,
      // for a busy one) go behind Details and to the console, as in the fill.
      console.error('Clean up failed:', err);
      setCleanupStatus('error');
      setCleanupError(err.message || 'Could not clean up the description.');
      setCleanupBusy(isBusyFailure(err));
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
    if (aiPending.size > 0) return;
    setTouched((t) => ({ ...t, name: true, date: true, description: true, serves: true }));
    if (errors.name || errors.date || errors.description || errors.serves) return;

    setSubmitError('');

    try {
      let photoUrls;
      if (photoMode === 'sketch') {
        const blob = await getSketchBlob();
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
        // Null when left blank: the card then says nothing about serves.
        serves: normaliseServes(serves),
        cuisine: cuisine.trim(),
        category: category.trim(),
        description: description.trim(),
        summary: summary.trim(),
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
        {/* The step counter already says where you are; the bar makes it
            glanceable and, by growing rather than jumping, shows that the
            last step moved you forward. */}
        <div className="add-meal-progress-track" aria-hidden="true">
          <span className="add-meal-progress-fill" style={{ transform: `scaleX(${step / 3})` }} />
        </div>
        <h2 className="add-meal-title">{STEP_TITLES[step]}</h2>

        {step === 1 && (
          <div className="add-meal-form">
            <div>
              <Label htmlFor="photo" required>
                Photo
              </Label>
              <SegmentedToggle
                className="add-meal-mode-toggle"
                label="Photo source"
                options={[
                  { value: 'upload', label: 'Photo' },
                  { value: 'sketch', label: 'Sketch' },
                ]}
                value={photoMode}
                onChange={(mode) => {
                  setPhotoMode(mode);
                  markTouched('photo');
                }}
              />
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
            </div>

            <div className="add-meal-footer">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                <ArrowIcon direction="back" /> Back
              </Button>
              <Button type="button" variant="primary" className="add-meal-next" onClick={handleAdvanceStep2}>
                Next <ArrowIcon />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form className="add-meal-form" onSubmit={handleSubmit} noValidate>
            {/* Shown only when AI fill failed on the way here. It explains
                why the card arrived empty without standing between the chef
                and saving the meal. */}
            {/* The Next button used to read "Filling in…" while it waited;
                the card isn't a button, so say it here for a screen reader. */}
            <p className="visually-hidden" role="status">
              {aiPending.size > 0 ? (aiFillStatus === 'retrying' ? 'Trying again…' : 'Filling in the details…') : ''}
            </p>
            {aiFillStatus === 'error' && (
              <div className="add-meal-notice" role="status">
                <p className="add-meal-notice-title">The AI couldn&rsquo;t fill this in</p>
                <p className="add-meal-notice-body">
                  The AI couldn&rsquo;t fill in the details, so your notes were carried over as the
                  description. Everything below is yours to edit, and the meal saves normally.
                </p>
                <div className="add-meal-notice-actions">
                  <button
                    type="button"
                    className="add-meal-inline-btn"
                    onClick={handleRetryAiFill}
                    disabled={isRetryingAiFill}
                  >
                    {isRetryingAiFill ? 'Trying again…' : 'Try again'}
                  </button>
                </div>
                {retryFailure !== null && (
                  <p className="add-meal-notice-retry-failed">
                    {retryFailure.busy ? (
                      'Still busy. Try again in a minute.'
                    ) : (
                      <>That didn&rsquo;t work. You can fill it in below.</>
                    )}
                  </p>
                )}
                <details className="add-meal-notice-details">
                  <summary>Details</summary>
                  <p className="add-meal-notice-reason">{aiFillError}</p>
                </details>
              </div>
            )}
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
              <Filling field="description" pending={aiPending}>
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
              </Filling>
              <div className="add-meal-counter">
                {description.length} / {DESCRIPTION_MAX}
              </div>
              {cleanupStatus === 'error' && (
                <>
                  <ErrorText>
                    The AI couldn&rsquo;t clean this up.{' '}
                    {cleanupBusy ? 'Still busy. Try again in a minute.' : 'Your description is unchanged.'}
                  </ErrorText>
                  <details className="add-meal-notice-details">
                    <summary>Details</summary>
                    <p className="add-meal-notice-reason">{cleanupError}</p>
                  </details>
                </>
              )}
              {touched.description && <ErrorText>{errors.description}</ErrorText>}
            </div>

            <div>
              <Label htmlFor="meal-summary" optional>
                Summary
              </Label>
              <Filling field="summary" pending={aiPending}>
                <TextInput
                  id="meal-summary"
                  maxLength={SUMMARY_MAX}
                  placeholder="One sentence for the dish's card"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  aria-describedby="meal-summary-help"
                />
              </Filling>
              <div className="add-meal-counter">
                {summary.length} / {SUMMARY_MAX}
              </div>
              <p id="meal-summary-help" className="field-help">
                The line on the dish&rsquo;s card. Left blank, the card makes one from the description.
              </p>
            </div>

            <div>
              <Label htmlFor="meal-name" required>
                Meal name
              </Label>
              <Filling field="name" pending={aiPending}>
                <TextInput
                  id="meal-name"
                  placeholder="Meal name (required)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => markTouched('name')}
                  error={touched.name && errors.name}
                />
              </Filling>
              {touched.name && <ErrorText>{errors.name}</ErrorText>}
            </div>

            <div className="add-meal-row">
              <div>
                <Label htmlFor="meal-date" required>
                  Date cooked
                </Label>
                <Filling field="date" pending={aiPending}>
                  <TextInput
                    id="meal-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    onBlur={() => markTouched('date')}
                    error={touched.date && errors.date}
                  />
                </Filling>
                {touched.date && <ErrorText>{errors.date}</ErrorText>}
              </div>
              <div className="add-meal-serves">
                <Label htmlFor="meal-serves" optional>
                  How many it served
                </Label>
                <TextInput
                  id="meal-serves"
                  type="number"
                  inputMode="numeric"
                  min={SERVES_MIN}
                  max={SERVES_MAX}
                  step={1}
                  value={serves}
                  onChange={(e) => setServes(e.target.value)}
                  onBlur={() => markTouched('serves')}
                  error={touched.serves && errors.serves}
                />
                {touched.serves && <ErrorText>{errors.serves}</ErrorText>}
              </div>
            </div>

            <div>
              <Label optional>Category</Label>
              <Filling field="category" pending={aiPending}>
                <BubbleSelect key={category} kind="category" value={category} onChange={setCategory} />
              </Filling>
            </div>

            <div>
              <Label optional>Cuisine</Label>
              <Filling field="cuisine" pending={aiPending}>
                <BubbleSelect key={cuisine} kind="cuisine" value={cuisine} onChange={setCuisine} />
              </Filling>
            </div>

            <div>
              <Label optional>Ingredients</Label>
              <Filling field="ingredients" pending={aiPending}>
                <IngredientBubbles value={ingredients} onChange={setIngredients} />
              </Filling>
            </div>

            <div>
              <div className="add-meal-label-row">
                <Label htmlFor="meal-method" optional>
                  Method
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
              <Filling field="method" pending={aiPending}>
                <TextArea
                  id="meal-method"
                  rows={3}
                  placeholder="Step by step, one step per line, numbered automatically"
                  value={methodText}
                  onChange={(e) => setMethodText(e.target.value)}
                />
              </Filling>
              {methodSpeechError && <ErrorText>{methodSpeechError}</ErrorText>}
            </div>

            <div>
              <Label htmlFor="meal-note" optional>
                Note
              </Label>
              <Filling field="note" pending={aiPending}>
                <TextInput
                  id="meal-note"
                  className="add-meal-note-input"
                  maxLength={NOTE_MAX}
                  placeholder="optional note you'd tell future chefs"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Filling>
            </div>

            {submitError && <ErrorText>{submitError}</ErrorText>}

            <div className="add-meal-footer">
              <Button type="button" variant="secondary" onClick={handleBackToNotes} disabled={isSaving}>
                <ArrowIcon direction="back" /> Back
              </Button>
              {/* The one red button in the app: it finishes adding the meal.
                  Held until the AI has answered, so a late fill can't land
                  on a card that has already been saved. */}
              <Button type="submit" variant="final" disabled={isSaving || aiPending.size > 0}>
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
