import { useEffect, useMemo, useState } from 'react';
import Gallery from './components/Gallery';
import MealDetailModal from './components/MealDetailModal';
import AddMealForm from './components/AddMealForm';
import PublishModal from './components/PublishModal';
import SignInScreen from './components/SignInScreen';
import ChooseUsername from './components/ChooseUsername';
import OnboardingTour from './components/OnboardingTour';
import PublicChefPage from './components/PublicChefPage';
import ThemeToggle from './components/ThemeToggle';
import { initialMeals, createMeal } from './data/meals';
import { isSupabaseConfigured } from './lib/supabase';
import { isCloudinaryConfigured } from './lib/cloudinary';
import { fetchMeals, insertMeal } from './lib/mealsApi';
import { fetchChefProfile } from './lib/chefsApi';
import { getSession, onAuthChange, signOut } from './lib/auth';
import './App.css';

function hasSeenOnboarding(userId) {
  try {
    return localStorage.getItem(`onboarding-seen-${userId}`) === '1';
  } catch {
    return true; // storage blocked — don't force the tour on every load
  }
}

function markOnboardingSeen(userId) {
  try {
    localStorage.setItem(`onboarding-seen-${userId}`, '1');
  } catch {
    // storage blocked — nothing to persist, tour just won't be remembered
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
  const [meals, setMeals] = useState(isSupabaseConfigured ? [] : initialMeals);
  const [loadError, setLoadError] = useState('');
  const [openMealId, setOpenMealId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(!isSupabaseConfigured);
  const [chefProfile, setChefProfile] = useState(null);
  const [chefProfileChecked, setChefProfileChecked] = useState(!isSupabaseConfigured);
  const [showOnboarding, setShowOnboarding] = useState(false);
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

  // Every account needs a chef profile (display name + page slug) before
  // they can use the app — new sign-ups get sent through ChooseUsername.
  useEffect(() => {
    if (!session) {
      setChefProfile(null);
      setChefProfileChecked(!isSupabaseConfigured);
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

  // Show the first-time welcome tour once per account, right after their
  // chef profile exists.
  useEffect(() => {
    if (!session || !chefProfile) return;
    if (!hasSeenOnboarding(session.user.id)) setShowOnboarding(true);
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

  const cuisines = useMemo(() => Array.from(new Set(meals.map((m) => m.cuisine))).sort(), [meals]);
  const categories = useMemo(() => Array.from(new Set(meals.map((m) => m.category))).sort(), [meals]);

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

  async function handleAddMeal(fields) {
    if (isSupabaseConfigured) {
      const meal = await insertMeal(fields, session.user.id);
      setMeals((prev) => [meal, ...prev]);
    } else {
      setMeals((prev) => [createMeal(fields), ...prev]);
    }
    setShowAddForm(false);
  }

  // Everyone hitting the admin app (root path) needs an account — the
  // public, read-only page for each chef is /<slug> (see PublicChefPage).
  if (isSupabaseConfigured && !sessionChecked) {
    return null;
  }

  if (isSupabaseConfigured && !session) {
    return <SignInScreen />;
  }

  if (isSupabaseConfigured && !chefProfileChecked) {
    return null;
  }

  if (isSupabaseConfigured && !chefProfile) {
    return <ChooseUsername userId={session.user.id} onCreated={setChefProfile} />;
  }

  const publicUrl = chefProfile ? `${window.location.origin}/${chefProfile.slug}` : null;

  return (
    <div>
      <div className="app-topbar">
        {(!isSupabaseConfigured || !isCloudinaryConfigured) && (
          <p className="app-config-notice">
            {!isSupabaseConfigured && !isCloudinaryConfigured
              ? 'Supabase and Cloudinary are not configured — running on local demo data. See .env.example.'
              : !isSupabaseConfigured
              ? 'Supabase is not configured — running on local demo data. See .env.example.'
              : 'Cloudinary is not configured — new photos stay local to this session. See .env.example.'}
          </p>
        )}
        <div className="app-topbar-actions">
          {publicUrl && (
            <a className="app-account-btn" href={publicUrl} target="_blank" rel="noreferrer">
              View public page ↗
            </a>
          )}
          {session && (
            <button type="button" className="app-account-btn" onClick={() => signOut()}>
              Sign out ({session.user.email})
            </button>
          )}
          <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} />
        </div>
      </div>

      {loadError && <p className="app-config-notice app-config-error">{loadError}</p>}

      <Gallery
        meals={sortedMeals}
        onOpenMeal={handleOpenMeal}
        onAddMeal={() => setShowAddForm(true)}
        onPublishSite={() => setShowPublish(true)}
      />

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
        <AddMealForm cuisines={cuisines} categories={categories} onSave={handleAddMeal} onCancel={() => setShowAddForm(false)} />
      )}

      {showPublish && <PublishModal meals={sortedMeals} onClose={() => setShowPublish(false)} />}

      {showOnboarding && (
        <OnboardingTour
          publicUrl={publicUrl}
          onDone={() => {
            if (session) markOnboardingSeen(session.user.id);
            setShowOnboarding(false);
          }}
        />
      )}
    </div>
  );
}
