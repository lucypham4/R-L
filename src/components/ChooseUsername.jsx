import { useState } from 'react';
import Button from './Button';
import { Label, TextInput, ErrorText, HelpText } from './TextField';
import { createChefProfile, isSlugAvailable } from '../lib/chefsApi';
import './SignInScreen.css';

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function ChooseUsername({ userId, onCreated }) {
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | working | error
  const [error, setError] = useState('');

  const effectiveSlug = slugTouched ? slug : slugify(displayName);
  const previewUrl = `${window.location.origin}/${effectiveSlug || 'your-name'}`;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const cleanSlug = slugify(effectiveSlug);
    if (!cleanSlug) {
      setStatus('error');
      setError('Choose a page name using letters, numbers, and dashes.');
      return;
    }

    setStatus('working');
    try {
      const available = await isSlugAvailable(cleanSlug);
      if (!available) {
        setStatus('error');
        setError(`${window.location.origin}/${cleanSlug} is taken. Try another.`);
        return;
      }
      const profile = await createChefProfile({
        id: userId,
        slug: cleanSlug,
        displayName: displayName.trim() || cleanSlug,
      });
      onCreated(profile);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not create your page.');
    }
  }

  const isWorking = status === 'working';

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <p className="signin-eyebrow">Meal Diary</p>
        <h1 className="signin-title">Set up your page</h1>
        <p className="signin-subtitle">Clients will see this page.</p>

        <form className="signin-form" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="chef-name" required>
              Your name
            </Label>
            <TextInput
              id="chef-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Lucy Pham"
              autoFocus
              required
            />
          </div>
          <div>
            <Label htmlFor="chef-slug" required>
              Page name
            </Label>
            <TextInput
              id="chef-slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="lucy-pham"
              required
            />
            <HelpText>Your page will be {previewUrl}. Choose carefully.</HelpText>
          </div>

          {status === 'error' && <ErrorText>{error}</ErrorText>}

          <Button type="submit" variant="primary" disabled={isWorking}>
            {isWorking ? 'Setting up…' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
