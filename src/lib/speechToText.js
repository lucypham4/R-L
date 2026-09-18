// Thin wrapper around the browser's Web Speech API. No network call and no
// API key: speech-to-text runs entirely on-device (or via the browser's own
// vendor service), so this works the same whether or not Supabase/Cloudinary
// are configured.

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Creates a speech recognizer for continuous dictation. `onResult` is called
 * with the full transcript accumulated since `start()` (interim results
 * included), so callers just replace their working text each time rather
 * than stitching fragments together. Returns null if the browser doesn't
 * support the API.
 */
export function createSpeechRecognizer({ onResult, onEnd, onError, lang = 'en-US' } = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognizer = new SpeechRecognition();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = lang;

  recognizer.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }
    onResult?.(transcript);
  };
  recognizer.onerror = (event) => onError?.(event.error);
  recognizer.onend = () => onEnd?.();

  return recognizer;
}
