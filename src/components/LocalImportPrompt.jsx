import { useState } from 'react';
import Button from './Button';
import { importLocalMeals } from '../lib/localImport';
import './SignInScreen.css';

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// Shown once, right after a fresh sign-up, only when this browser has local
// meals and the new account is guaranteed empty (ADR 0001: this never runs
// against an account that might already hold cloud meals).
export default function LocalImportPrompt({ userId, mealCount, onImported, onDone }) {
  const [status, setStatus] = useState('confirm'); // confirm | working | done
  const [result, setResult] = useState(null);

  async function handleImport() {
    setStatus('working');
    const outcome = await importLocalMeals(userId);
    onImported(outcome.imported);
    setResult(outcome);
    setStatus('done');
  }

  if (status === 'done') {
    const { succeeded, failed, total } = result;
    return (
      <div className="signin-screen">
        <div className="signin-card">
          <p className="signin-eyebrow">Meal Diary</p>
          <h1 className="signin-title">
            {failed === 0 ? `Imported ${plural(succeeded, 'meal')}` : `Imported ${succeeded} of ${total}`}
          </h1>
          <p className="signin-subtitle">
            {failed === 0
              ? 'From this device, into your new account.'
              : `${plural(failed, 'meal')} stayed on this device — retry any time from Settings.`}
          </p>
          <div className="signin-form">
            <Button variant="primary" onClick={onDone}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <p className="signin-eyebrow">Meal Diary</p>
        <h1 className="signin-title">Bring your meals along?</h1>
        <p className="signin-subtitle">{plural(mealCount, 'meal')} on this device, not yet in your new account.</p>
        <div className="signin-form">
          <Button variant="primary" onClick={handleImport} disabled={status === 'working'}>
            {status === 'working' ? 'Importing…' : `Import ${plural(mealCount, 'meal')}`}
          </Button>
        </div>
        <button type="button" className="signin-guest-link" onClick={onDone} disabled={status === 'working'}>
          Not now
        </button>
      </div>
    </div>
  );
}
