import { useEffect, useMemo, useState } from 'react';
import Gallery from './components/Gallery';
import MealDetailModal from './components/MealDetailModal';
import AddMealForm from './components/AddMealForm';
import PublishModal from './components/PublishModal';
import SignInScreen from './components/SignInScreen';
import ChooseUsername from './components/ChooseUsername';
import OnboardingTour from './components/OnboardingTour';
import PublicChefPage from './components/PublicChefPage';
import BottomNav from './components/BottomNav';
import SettingsPage from './components/SettingsPage';
import { isSupabaseConfigured } from './lib/supabase';
import { isCloudinaryConfigured } from './lib/cloudinary';
import { fetchMeals, insertMeal } from './lib/mealsApi';
import { fetchChefProfile } from './lib/chefsApi';
import { getSession, onAuthChange, signOut } from './lib/auth';
import { loadLocalMeals, saveLocalMeals, createLocalMeal } from './lib/localMeals';
import './App.css';

function hasSeenOnboarding(key) {
  try {
    return localStorage.getItem(`onboarding-seen-${key}`) === '1';
  } catch {
    return true; // storage blocked, don't force the tour on every load
  }
}

function markOnboardingSeen(key) {
  try {
    localStorage.setItem(`onboarding-seen-${key}`, '1');
  } catch {
    // storage blocked, nothing to persist, tour just won't be remembered
  }
}

export default function App() {
  // Every chef's public page lives at /<slug>; anything else is the
  // private admin app. No router library needed for one path segment.
  const slug = window.location.pathname.replace(/^\/+|\/+$/g, '');

  if (slug) {
    return <PublicChefPage slug={slug} />;
  }

  return <AdminApp />;
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
  const [showPublish, setShowPublish] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [signInMode, setSignInMode] = useState('signin');
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [chefProfile, setChefProfile] = useState(null);
  const [chefProfileChecked, setChefProfileChecked] = useState(!isSupabaseConfigured);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
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
    getSession()
      .then(setSession)
      .catch(() => {})
      .finally(() => setSessionChecked(true));
    return onAuthChange(setSession);
  }, []);

  // A signed-in account needs a chef profile (display name + page slug)
  // before it can use the app, new sign-ups get sent through
  // ChooseUsername. Nothing here runs for the (default) no-account case.
  useEffect(() => {
    if (!session) {
      setChefProfile(null);
      setChefProfileChecked(true);
      return;
    }
    let cancelled = false;
    setChefProfileChecked(false);
    fetchChefProfile(session.user.id)
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
  }, [session]);

  // First-time welcome tour, once per account if signed in, otherwise
  // once per device/browser. Runs either way; no account required.
  useEffect(() => {
    if (session && !chefProfile) return; // still setting up the account
    const key = session ? session.user.id : 'local';
    if (!hasSeenOnboarding(key)) setShowOnboarding(true);
  }, [session, chefProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session) return;
    let cancelled = false;

    fetchMeals(session.user.id)
      .then((rows) => {
        if (!cancelled) setMeals(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Could not load meals from Supabase.');
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const sortedMeals = useMemo(
    () => [...meals].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [meals]
  );

  const openIndex = sortedMeals.findIndex((m) => String(m.id) === String(openMealId));
  const openMeal = openIndex >= 0 ? sortedMeals[openIndex] : null;

  function handleOpenMeal(meal) {
    const url = new URL(window.location);
    url.searchParams.set('meal', meal.id);
    window.history.pushState({}, '', url);
    setOpenMealId(meal.id);
  }

  function closeMeal() {
    const url = new URL(window.location);
    url.searchParams.delete('meal');
    window.history.pushState({}, '', url);
    setOpenMealId(null);
  }

  function handleNavHome() {
    setShowAddForm(false);
    setShowPublish(false);
    closeMeal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleToggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }

  function handleRequestSignIn() {
    setSignInMode('signin');
    setShowSignIn(true);
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

  if (isSupabaseConfigured && !sessionChecked) {
    return null;
  }

  if (showSignIn && !session) {
    return <SignInScreen initialMode={signInMode} onGuest={() => setShowSignIn(false)} />;
  }

  if (session && !chefProfileChecked) {
    return null;
  }

  if (session && !chefProfile) {
    return <ChooseUsername userId={session.user.id} onCreated={setChefProfile} />;
  }

  const publicUrl = chefProfile ? `${window.location.origin}/${chefProfile.slug}` : null;

  if (showOnboarding) {
    return (
      <OnboardingTour
        publicUrl={publicUrl}
        onDone={() => {
          markOnboardingSeen(session ? session.user.id : 'local');
          setShowOnboarding(false);
        }}
      />
    );
  }

  if (showSettings) {
    return (
      <SettingsPage
        onBack={() => setShowSettings(false)}
        isSupabaseConfigured={isSupabaseConfigured}
        session={session}
        publicUrl={publicUrl}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSignIn={handleRequestSignIn}
        onSignOut={signOut}
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

      <Gallery meals={sortedMeals} onOpenMeal={handleOpenMeal} onAddMeal={() => setShowAddForm(true)} onPublishSite={() => setShowPublish(true)} />

      {openMeal && (
        <MealDetailModal
          meal={openMeal}
          index={sortedMeals.length - openIndex}
          total={sortedMeals.length}
          onClose={closeMeal}
          sharePath={chefProfile ? `/${chefProfile.slug}` : '/'}
        />
      )}

      {showAddForm && (
        <AddMealForm onSave={handleAddMeal} onCancel={() => setShowAddForm(false)} />
      )}

      {showPublish && <PublishModal meals={sortedMeals} onClose={() => setShowPublish(false)} />}

      <BottomNav onHome={handleNavHome} onAdd={() => setShowAddForm(true)} onProfile={() => setShowSettings(true)} />
    </div>
  );
}
