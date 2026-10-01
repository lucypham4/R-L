import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import Button from './Button';
import PhotoCropModal from './PhotoCropModal';
import { SpecialtyTags, SocialLinks, SpecialtyPicker } from './ChefDetails';
import { Label, TextInput, TextArea, ErrorText, HelpText } from './TextField';
import { AVATAR_SIZE } from '../lib/avatar';
import { BIO_MAX_LENGTH } from '../lib/chefsApi';
import { PLATFORMS, parseLink } from '../lib/socialLinks';
import './ProfilePage.css';

// "Chef Ana", as the sketch has it, without making "Chef Ana" into
// "Chef Chef Ana" for anyone who already called themselves that.
export function chefTitle(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return /^chef\b/i.test(trimmed) ? trimmed : `Chef ${trimmed}`;
}

/**
 * Hands the public page's link to the OS share sheet where there is one,
 * and otherwise copies it. Resolves to what happened, for the page to say.
 */
async function shareLink(title, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (err) {
      // The chef closed the sheet: nothing to say.
      if (err?.name === 'AbortError') return 'idle';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5v11" />
        <path d="M8 7.5l4-4 4 4" />
        <path d="M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2" />
      </g>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </g>
    </svg>
  );
}

// The edit form. Nothing in it is saved until Save, the picture included,
// so Cancel always leaves the profile exactly as it was.
function ProfileForm({ chefProfile, avatarUrl, onChangeAvatar, onSaveProfile, onDone }) {
  const inputRef = useRef(null);
  const [name, setName] = useState(chefProfile?.displayName ?? '');
  const [bio, setBio] = useState(chefProfile?.bio ?? '');
  const [specialties, setSpecialties] = useState(chefProfile?.specialties ?? []);
  // As typed: "@ana", a pasted profile link, an address. Parsed on Save.
  const [linkDrafts, setLinkDrafts] = useState(() =>
    Object.fromEntries(PLATFORMS.map((p) => [p.key, chefProfile?.links?.[p.key] ?? '']))
  );
  const [linkErrors, setLinkErrors] = useState({});
  // undefined: the picture is untouched. null: removed. Otherwise the
  // newly cropped one, with a URL to preview it by.
  const [photo, setPhoto] = useState(undefined);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [error, setError] = useState('');
  const saving = status === 'saving';

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  const shownAvatar = photo === undefined ? avatarUrl : photo?.url ?? null;

  async function handleSubmit(e) {
    e.preventDefault();
    const displayName = name.trim();
    if (chefProfile && !displayName) {
      setStatus('error');
      setError('Your page needs a name.');
      return;
    }
    const links = {};
    const badLinks = {};
    for (const platform of PLATFORMS) {
      const parsed = parseLink(platform.key, linkDrafts[platform.key]);
      if (parsed === null) badLinks[platform.key] = true;
      else if (parsed) links[platform.key] = parsed;
    }
    setLinkErrors(badLinks);
    const bad = PLATFORMS.filter((p) => badLinks[p.key]).map((p) => p.label);
    if (bad.length) {
      setStatus('error');
      setError(`That doesn't look like a ${bad.join(' or ')} link. Try @yourname, or paste the address.`);
      return;
    }
    setStatus('saving');
    setError('');
    try {
      if (photo !== undefined) {
        await onChangeAvatar(photo ? photo.blob : null);
        // Saved: a retry after the profile fails below shouldn't upload
        // it again.
        setPhoto(undefined);
      }
      if (chefProfile) {
        // Only what changed: see updateChefProfile.
        const next = { displayName, bio: bio.trim(), specialties, links };
        const changes = Object.fromEntries(
          Object.entries(next).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(chefProfile[field]))
        );
        if (Object.keys(changes).length) await onSaveProfile(changes);
      }
      onDone();
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not save your profile.');
    }
  }

  return (
    <>
      <form className="profile-form" onSubmit={handleSubmit} aria-label="Edit profile">
        <div className="profile-photo">
          <Avatar src={shownAvatar} size={112} />
          <div className="profile-photo-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={saving}
              autoFocus={!chefProfile}
            >
              {shownAvatar ? 'Change photo' : 'Add photo'}
            </Button>
            {shownAvatar && (
              <Button type="button" variant="ghost" onClick={() => setPhoto(null)} disabled={saving}>
                Remove
              </Button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              // Cleared so choosing the same file again still fires.
              e.target.value = '';
              if (chosen) setFile(chosen);
            }}
          />
        </div>

        {chefProfile ? (
          <>
            <div>
              <Label htmlFor="profile-name" required>
                Name
              </Label>
              <TextInput
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoComplete="name"
                autoFocus
                required
              />
            </div>
            <div>
              <Label htmlFor="profile-bio" optional>
                Short bio
              </Label>
              <TextArea
                id="profile-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={BIO_MAX_LENGTH}
                rows={4}
                placeholder="Where you cook, what you cook, who you cook for."
              />
              <HelpText>
                Shown under your name on your public page. {bio.length}/{BIO_MAX_LENGTH}
              </HelpText>
            </div>
            <fieldset className="profile-fieldset">
              <legend className="field-label">
                Specialties <span className="field-optional">optional</span>
              </legend>
              <SpecialtyPicker value={specialties} onChange={setSpecialties} disabled={saving} />
            </fieldset>
            <fieldset className="profile-fieldset profile-links-fields">
              <legend className="field-label">
                Links <span className="field-optional">optional</span>
              </legend>
              {PLATFORMS.map((platform) => (
                <div key={platform.key} className="profile-link-field">
                  <label htmlFor={`profile-link-${platform.key}`} className="profile-link-label">
                    {platform.label}
                  </label>
                  <TextInput
                    id={`profile-link-${platform.key}`}
                    value={linkDrafts[platform.key]}
                    onChange={(e) => setLinkDrafts((prev) => ({ ...prev, [platform.key]: e.target.value }))}
                    placeholder={platform.placeholder}
                    error={linkErrors[platform.key]}
                    aria-invalid={linkErrors[platform.key] || undefined}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="url"
                  />
                </div>
              ))}
            </fieldset>
          </>
        ) : (
          <p className="profile-note">Your picture stays on this device. Sign in from Settings to add a name and a bio.</p>
        )}

        {status === 'error' && <ErrorText>{error}</ErrorText>}

        <div className="profile-form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>

      {file && (
        <PhotoCropModal
          file={file}
          round
          outputSize={AVATAR_SIZE}
          onCancel={() => setFile(null)}
          onCrop={(blob) => {
            setFile(null);
            setPhoto({ blob, url: URL.createObjectURL(blob) });
          }}
        />
      )}
    </>
  );
}

/**
 * The chef's own profile, where the picture in the top right of Home
 * goes: their picture, name, specialties, short bio and links as clients
 * see them, with Edit, Share (the public page's link) and Settings beside
 * the name.
 */
export default function ProfilePage({
  onBack,
  onOpenSettings,
  chefProfile,
  publicUrl,
  avatarUrl,
  onChangeAvatar,
  onSaveProfile,
}) {
  const [editing, setEditing] = useState(false);
  const [shareStatus, setShareStatus] = useState('idle'); // idle | shared | copied | failed
  const editRef = useRef(null);
  const wasEditing = useRef(false);

  // Closing the form takes away what had focus; hand it back to Edit.
  useEffect(() => {
    if (!editing && wasEditing.current) editRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const name = chefProfile ? chefTitle(chefProfile.displayName) : 'Your kitchen';
  const pageAddress = publicUrl ? publicUrl.replace(/^https?:\/\//, '') : null;

  async function handleShare() {
    setShareStatus('idle');
    setShareStatus(await shareLink(name, publicUrl));
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        <button type="button" className="profile-back" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <h1 className="profile-title">My profile</h1>
      </header>

      {editing ? (
        <ProfileForm
          chefProfile={chefProfile}
          avatarUrl={avatarUrl}
          onChangeAvatar={onChangeAvatar}
          onSaveProfile={onSaveProfile}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="profile-hero">
            <Avatar src={avatarUrl} size={112} className="profile-avatar" />
            <h2 className="profile-name">{name}</h2>
            {pageAddress && (
              <a className="profile-address" href={publicUrl} target="_blank" rel="noreferrer">
                {pageAddress}
              </a>
            )}
            <div className="profile-actions">
              <Button ref={editRef} variant="secondary" className="profile-edit" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {publicUrl && (
                <button type="button" className="profile-icon-btn" onClick={handleShare} aria-label="Share your page">
                  <ShareIcon />
                </button>
              )}
              <button type="button" className="profile-icon-btn" onClick={onOpenSettings} aria-label="Settings">
                <GearIcon />
              </button>
            </div>
            <p className="profile-share-status" role="status">
              {shareStatus === 'copied' && 'Link copied.'}
              {shareStatus === 'failed' && `Couldn't copy it. Your page is at ${pageAddress}.`}
            </p>
            <SpecialtyTags specialties={chefProfile?.specialties} className="profile-tags" />
          </div>

          <section className="profile-bio" aria-label="Bio">
            {!chefProfile ? (
              <p className="profile-bio-empty">
                Sign in from Settings for a public page, with your name and a short bio on it.
              </p>
            ) : chefProfile.bio ? (
              <p className="profile-bio-text">{chefProfile.bio}</p>
            ) : (
              <p className="profile-bio-empty">
                No bio yet. A line or two about your cooking is the first thing people read on your page.
              </p>
            )}
          </section>

          <SocialLinks links={chefProfile?.links} className="profile-links" />
        </>
      )}
    </div>
  );
}
