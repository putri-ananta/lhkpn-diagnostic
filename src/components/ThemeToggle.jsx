import { useEffect, useState } from 'react';

const THEME_KEY = 'lhkpn-theme';
const THEMES = ['light', 'dark', 'system'];

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getEffectiveTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored && THEMES.includes(stored)) return stored;
  return 'system';
}

function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.setAttribute('data-theme', getSystemTheme());
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function ThemeToggle({ theme, onThemeChange }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handler);
    return () => window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handler);
  }, [theme]);

  const handleSelect = (t) => {
    localStorage.setItem(THEME_KEY, t);
    onThemeChange(t);
    setOpen(false);
  };

  const iconForTheme = (t) => {
    if (t === 'light') return '☀️';
    if (t === 'dark') return '🌙';
    return '💻';
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="keu-btn keu-btn-outline keu-btn-sm"
        onClick={() => setOpen(!open)}
        title="Ganti tema tampilan"
        style={{ gap: '0.375rem' }}
      >
        {iconForTheme(theme)} {theme.charAt(0).toUpperCase() + theme.slice(1)}
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 45 }}
            onClick={() => setOpen(false)}
          />
          <div
            className="keu-card"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.5rem',
              minWidth: '140px',
              padding: '0.5rem',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {THEMES.map((t) => (
              <button
                key={t}
                className={`keu-btn ${theme === t ? 'keu-btn-primary' : 'keu-btn-secondary'} keu-btn-sm`}
                style={{ width: '100%', justifyContent: 'flex-start', gap: '0.5rem' }}
                onClick={() => handleSelect(t)}
              >
                {iconForTheme(t)} {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
