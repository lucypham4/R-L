import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Gallery from './components/Gallery';
import MealDetailModal from './components/MealDetailModal';
import AddMealForm from './components/AddMealForm';
import SignInScreen from './components/SignInScreen';
import NewPasswordScreen from './components/NewPasswordScreen';
import ChooseUsername from './components/ChooseUsername';
import LocalImportPrompt from './components/LocalImportPrompt';
import PublicChefPage from './components/PublicChefPage';
import BottomNav from './components/BottomNav';
import SettingsPage from './components/SettingsPage';
import ProfilePage from './components/ProfilePage';
import Splash from './components/Splash';
import { isSupabaseConfigured } from './lib/supabase';
import { isCloudinaryConfigured } from './lib/cloudinary';
import { fetchMeals, insertMeal, deleteMeal, updateMealSummary } from './lib/mealsApi';
import { fetchChefProfile, updateChefPageTheme, updateChefAvatar, updateChefProfile } from './lib/chefsApi';
import { getSession, onAuthChange, signOut, isRecoveringPassword, takeEmailLinkError } from './lib/auth';
import { loadLocalMeals, saveLocalMeals, createLocalMeal } from './lib/localMeals';
import { scrollToTop } from './lib/motion';
import { leaveDish, pushDish, replaceDish } from './lib/dishHistory';
import { stepOnShelf } from './lib/shelf';
import { needsSummary } from './lib/meal';
import { summarizeDish, isAiConfigured } from './lib/aiFill';
import { loadTheme, saveTheme, nextTheme, applyTheme } from './lib/theme';
import { importLocalMeals, countLocalMeals } from './lib/localImport';
import { loadLocalAvatar, saveLocalAvatar, storeAvatar } from './lib/avatar';
import './App.css';

export default function App() {
  // Every chef's public page lives at /<slug>; anything else is the
  // private admin app. No router library needed for one path segment.
  const slug = window.location.pathname.replace(/^\/+|\/+$/g, '');

  if (slug) {
    return (
      <>
        <PublicChefPage slug={slug} />
        <Analytics />
      </>
    );
  }

  return (
    <>
      <AdminApp />
      <Splash />
      <Analytics />
    </>
  );
}

function AdminApp() {
  // An account is entirely optional: without one, meals persist to this
  // browser only (localMeals.js). Signing in is an opt-in upgrade for a
  // live public page and access from more than one device.
  // Starts from local storage regardless of Supabase config. If a session
  // turns out to exist, the fetch effect below replaces this with their
  // cloud meals once it resolves.
  const [meals, setMeals] = useState(() => loadLocalMeals());
  const [loadError, setLoadError] = useState('');
  const [openMealId, setOpenMealId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [signInMode, setSignInMode] = useState('signin');
  const [signInNotice, setSignInNotice] = useState('');
  const [session, setSession] = useState(null);
  // Arrived from a password-reset link: signed in, but with a new password
  // still to choose.
  const [recoveringPassword, setRecoveringPassword] = useState(isRecoveringPassword);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [chefProfile, setChefProfile] = useState(null);
  const [chefProfileChecked, setChefProfileChecked] = useState(!isSupabaseConfigured);
  // The picture in the top right opens the chef's profile; Settings opens
  // from there, and its Back returns to it.
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  // A guest's profile picture. A chef's is on chefProfile instead.
  const [localAvatar, setLocalAvatar] = useState(loadLocalAvatar);
  // Local Import (see CONTEXT.md / ADR 0001): offered once, right after a
  // fresh sign-up, while the new account is guaranteed empty. Anything
  // declined or left behind by a partial failure stays in local storage,
  // surfaced again as a manual retry in Settings (localMealCount below).
  const [showLocalImport, setShowLocalImport] = useState(false);
  const [localImportCount, setLocalImportCount] = useState(0);
  const [localMealCount, setLocalMealCount] = useState(() => countLocalMeals());

  // Before the first paint, so the first frame (Splash) is already in
  // the chef's theme rather than flashing the light one.
  useLayoutEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  // Shareable meal links: `?meal=<id>` opens that meal directly, and
  // browser back/forward closes/reopens it via popstate.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialMealId = params.get('meal');
    if (initialMealId) setOpenMealId(initialMealId);

    function onPopState() {
      const p = new URLSearchParams(window.location.search);
      setOpenMealId(p.get('meal'));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // A reset or confirmation link that had expired: say so on the
    // sign-in screen, where there's a way to ask for another.
    const linkError = takeEmailLinkError();
    if (linkError) {
      setSignInNotice(linkError);
      setShowSignIn(true);
    }
    getSession()
      .then(setSession)
      .catch(() => {})
      .finally(() => setSessionChecked(true));
    return onAuthChange((next, event) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      else if (!next) setRecoveringPassword(false);
    });
  }, []);

  // The effects below follow who is signed in, not the session object,
  // which is replaced every time the token refreshes (hourly) or the chef
  // re-enters their password in Settings. Keyed on the session, each of
  // those refetched the profile and blanked the app while it did.
  const userId = session?.user?.id ?? null;

  // A signed-in account needs a chef profile (display name + page slug)
  // before it can use the app, new sign-ups get sent through
  // ChooseUsername. Nothing here runs for the (default) no-account case.
  useEffect(() => {
    if (!userId) {
      setChefProfile(null);
      setChefProfileChecked(true);
      return;
    }
    let cancelled = false;
    setChefProfileChecked(false);
    fetchChefProfile(userId)
      .then((profile) => {
        if (!cancelled) setChefProfile(profile);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChefProfileChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let cancelled = false;

    fetchMeals(userId)
      .then((rows) => {
        if (!cancelled) setMeals(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Could not load meals from Supabase.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sortedMeals = useMemo(
    () => [...meals].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [meals]
  );

  const openIndex = sortedMeals.findIndex((m) => String(m.id) === String(openMealId));
  const openMeal = openIndex >= 0 ? sortedMeals[openIndex] : null;
  // The dishes either side, in the modal's numbering: see handleStepMeal.
  const prevMeal = stepOnShelf(sortedMeals, openIndex, -1);
  const nextMeal = stepOnShelf(sortedMeals, openIndex, 1);

  function handleOpenMeal(meal) {
    pushDish(meal.id);
    setOpenMealId(meal.id);
  }

  // Step through the archive from inside the open dish. `delta` is in the
  // numbering the modal shows ("No. 12 of 47"), which runs opposite to
  // sortedMeals -- that's newest-first, so the highest number is index 0 --
  // and wraps round at both ends (lib/shelf.js). Stepping replaces the
  // history entry rather than pushing one, so Back
  // still leaves the modal instead of walking every dish you passed.
  function handleStepMeal(delta) {
    const next = stepOnShelf(sortedMeals, openIndex, delta);
    if (!next) return;
    replaceDish(next.id);
    setOpenMealId(next.id);
  }

  // A meal logged before summaries existed, whose card has had to make do
  // with its ingredients, gets one written the first time its chef opens
  // it, and saved: once per meal per visit, and never on a public page,
  // whose readers can't write to it. Any failure just leaves the card as
  // it was, to try again next time.
  const summarising = useRef(new Set());
  useEffect(() => {
    if (!openMeal || !isAiConfigured || !needsSummary(openMeal)) return;
    if (summarising.current.has(openMeal.id)) return;
    summarising.current.add(openMeal.id);
    const id = openMeal.id;
    summarizeDish(openMeal)
      .then((summary) => {
        if (!summary) return;
        setMeals((prev) => {
          const next = prev.map((m) => (m.id === id ? { ...m, summary } : m));
          if (!userId) saveLocalMeals(next);
          return next;
        });
        if (userId) return updateMealSummary(id, summary);
      })
      .catch(() => {});
  }, [openMeal, userId]);

  function closeMeal() {
    leaveDish();
    setOpenMealId(null);
  }

  function handleNavHome() {
    setShowAddForm(false);
    closeMeal();
    scrollToTop();
  }

  function handleToggleTheme() {
    setTheme(nextTheme);
  }

  // Writes the chef's public-page theme through to their profile. Kept in
  // App so the local chefProfile stays in step with the row that was just
  // saved; SettingsPage re-renders from it. Errors propagate so the row
  // can roll its own state back.
  async function handleChangePageTheme(pageTheme) {
    const updated = await updateChefPageTheme(session.user.id, pageTheme);
    setChefProfile(updated);
  }

  // A new profile picture, or null to go back to the default. Signed in,
  // it's saved to the chef's profile; otherwise to this device. Errors
  // propagate, for the profile page to show.
  async function handleChangeAvatar(blob) {
    if (chefProfile) {
      const url = blob ? await storeAvatar(blob) : null;
      setChefProfile(await updateChefAvatar(userId, url));
      return;
    }
    const url = blob ? await storeAvatar(blob, { upload: false }) : null;
    saveLocalAvatar(url);
    setLocalAvatar(url);
  }

  const avatarUrl = chefProfile ? chefProfile.avatarUrl : localAvatar;

  // The chef's name and bio, from Edit on their profile. Errors propagate,
  // for the form to show.
  async function handleSaveProfile(fields) {
    setChefProfile(await updateChefProfile(userId, fields));
  }

  // `mode` is 'signin' or 'signup': a guest asked to make their page live
  // starts on the sign-up form.
  function handleRequestSignIn(mode = 'signin') {
    setSignInMode(mode);
    setSignInNotice('');
    setShowSignIn(true);
  }

  function handleChefCreated(profile) {
    setChefProfile(profile);
    const count = countLocalMeals();
    if (count > 0) {
      setLocalImportCount(count);
      setShowLocalImport(true);
    }
  }

  function handleLocalImportDone() {
    setShowLocalImport(false);
    setLocalMealCount(countLocalMeals());
  }

  async function handleImportLocalMeals() {
    const outcome = await importLocalMeals(session.user.id);
    setMeals((prev) => [...outcome.imported, ...prev]);
    setLocalMealCount(countLocalMeals());
    return outcome;
  }

  async function handleAddMeal(fields) {
    if (isSupabaseConfigured && session) {
      const meal = await insertMeal(fields, session.user.id);
      setMeals((prev) => [meal, ...prev]);
    } else {
      setMeals((prev) => {
        const next = [createLocalMeal(fields), ...prev];
        saveLocalMeals(next);
        return next;
      });
    }
    setShowAddForm(false);
  }

  async function handleDeleteMeal(id) {
    if (isSupabaseConfigured && session) {
      await deleteMeal(id);
    }
    setMeals((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (!isSupabaseConfigured || !session) saveLocalMeals(next);
      return next;
    });
    if (String(openMealId) === String(id)) closeMeal();
  }

  if (isSupabaseConfigured && !sessionChecked) {
    return null;
  }

  if (session && recoveringPassword) {
    return <NewPasswordScreen email={session.user.email} onDone={() => setRecoveringPassword(false)} />;
  }

  if (showSignIn && !session) {
    return (
      <SignInScreen initialMode={signInMode} initialNotice={signInNotice} onGuest={() => setShowSignIn(false)} />
    );
  }

  if (session && !chefProfileChecked) {
    return null;
  }

  if (session && !chefProfile) {
    return <ChooseUsername userId={session.user.id} onCreated={handleChefCreated} />;
  }

  if (showLocalImport) {
    return (
      <LocalImportPrompt
        userId={session.user.id}
        mealCount={localImportCount}
        onImported={(importedMeals) => setMeals((prev) => [...importedMeals, ...prev])}
        onDone={handleLocalImportDone}
      />
    );
  }

  const publicUrl = chefProfile ? `${window.location.origin}/${chefProfile.slug}` : null;

  if (showSettings) {
    return (
      <SettingsPage
        onBack={() => setShowSettings(false)}
        isSupabaseConfigured={isSupabaseConfigured}
        session={session}
        publicUrl={publicUrl}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSignIn={() => handleRequestSignIn('signin')}
        onSignOut={signOut}
        chefProfile={chefProfile}
        onChangePageTheme={chefProfile ? handleChangePageTheme : undefined}
        localMealCount={localMealCount}
        onImportLocalMeals={handleImportLocalMeals}
      />
    );
  }

  if (showProfile) {
    return (
      <ProfilePage
        onBack={() => setShowProfile(false)}
        onOpenSettings={() => setShowSettings(true)}
        chefProfile={chefProfile}
        publicUrl={publicUrl}
        avatarUrl={avatarUrl}
        onChangeAvatar={handleChangeAvatar}
        onSaveProfile={handleSaveProfile}
        // No Supabase, no accounts: nothing to sign up for.
        onSignIn={isSupabaseConfigured ? handleRequestSignIn : undefined}
      />
    );
  }

  return (
    <div>
      {!isCloudinaryConfigured && (
        <div className="app-topbar">
          <p className="app-config-notice">Cloudinary isn't configured. Photos won't survive a reload.</p>
        </div>
      )}

      {loadError && <p className="app-config-notice app-config-error">{loadError}</p>}

      {/* The gallery recedes behind an open dish rather than just dimming
          under a scrim: the depth of field is what makes the dish read as
          the thing in focus. */}
      <div className={`app-stage ${openMeal ? 'app-stage-receded' : ''}`}>
        <Gallery
          meals={sortedMeals}
          onOpenMeal={handleOpenMeal}
          onAddMeal={() => setShowAddForm(true)}
          onDeleteMeal={handleDeleteMeal}
          avatarUrl={avatarUrl}
          onOpenProfile={() => setShowProfile(true)}
        />
      </div>

      {openMeal && (
        <MealDetailModal
          meal={openMeal}
          index={sortedMeals.length - openIndex}
          total={sortedMeals.length}
          onClose={closeMeal}
          onStep={handleStepMeal}
          prevMeal={prevMeal}
          nextMeal={nextMeal}
        />
      )}

      {showAddForm && (
        <AddMealForm onSave={handleAddMeal} onCancel={() => setShowAddForm(false)} />
      )}

      <BottomNav
        active={showAddForm ? 'add' : 'home'}
        onHome={handleNavHome}
        onAdd={() => setShowAddForm(true)}
      />
    </div>
  );
}
