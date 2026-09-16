import { useEffect, useMemo, useState } from 'react';
import Gallery from './components/Gallery';
import MealDetailModal from './components/MealDetailModal';
import AddMealForm from './components/AddMealForm';
import PublishModal from './components/PublishModal';
import LoginModal from './components/LoginModal';
import ThemeToggle from './components/ThemeToggle';
import { initialMeals, createMeal } from './data/meals';
import { isSupabaseConfigured } from './lib/supabase';
import { isCloudinaryConfigured } from './lib/cloudinary';
import { fetchMeals, insertMeal } from './lib/mealsApi';
import { getSession, onAuthChange, signOut } from './lib/auth';
import './App.css';

export default function App() {
  const [meals, setMeals] = useState(isSupabaseConfigured ? [] : initialMeals);
  const [loadError, setLoadError] = useState('');
  const [openMealId, setOpenMealId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [session, setSession] = useState(null);
  const [theme, setTheme] = useState('light');

  // In demo mode (no Supabase) editing stays open to everyone, matching the
  // app's pre-auth behavior. Once Supabase is configured, adding meals and
  // publishing the site are gated to Lucy and her partner's own accounts.
  const canEdit = !isSupabaseConfigured || Boolean(session);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSession()
      .then(setSession)
      .catch(() => {});
    return onAuthChange(setSession);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    fetchMeals()
      .then((rows) => {
        if (!cancelled) setMeals(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Could not load meals from Supabase.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedMeals = useMemo(
    () => [...meals].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [meals]
  );

  const cuisines = useMemo(() => Array.from(new Set(meals.map((m) => m.cuisine))).sort(), [meals]);
  const categories = useMemo(() => Array.from(new Set(meals.map((m) => m.category))).sort(), [meals]);

  const openIndex = sortedMeals.findIndex((m) => m.id === openMealId);
  const openMeal = openIndex >= 0 ? sortedMeals[openIndex] : null;

  async function handleAddMeal(fields) {
    if (isSupabaseConfigured) {
      const meal = await insertMeal(fields);
      setMeals((prev) => [meal, ...prev]);
    } else {
      setMeals((prev) => [createMeal(fields), ...prev]);
    }
    setShowAddForm(false);
  }

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
          {isSupabaseConfigured &&
            (session ? (
              <button type="button" className="app-account-btn" onClick={() => signOut()}>
                Sign out ({session.user.email})
              </button>
            ) : (
              <button type="button" className="app-account-btn" onClick={() => setShowLogin(true)}>
                Sign in
              </button>
            ))}
          <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} />
        </div>
      </div>

      {loadError && <p className="app-config-notice app-config-error">{loadError}</p>}

      <Gallery
        meals={sortedMeals}
        onOpenMeal={(meal) => setOpenMealId(meal.id)}
        onAddMeal={() => setShowAddForm(true)}
        onPublishSite={() => setShowPublish(true)}
        canEdit={canEdit}
        onRequestSignIn={() => setShowLogin(true)}
      />

      {openMeal && (
        <MealDetailModal
          meal={openMeal}
          index={sortedMeals.length - openIndex}
          total={sortedMeals.length}
          onClose={() => setOpenMealId(null)}
        />
      )}

      {showAddForm && (
        <AddMealForm cuisines={cuisines} categories={categories} onSave={handleAddMeal} onCancel={() => setShowAddForm(false)} />
      )}

      {showPublish && <PublishModal meals={sortedMeals} onClose={() => setShowPublish(false)} />}

      {showLogin && <LoginModal onSignedIn={() => setShowLogin(false)} onCancel={() => setShowLogin(false)} />}
    </div>
  );
}
