// A ~30-line hash router — no react-router. Five screens (a sidebar of
// tabs, "nenhuma é a principal" per the product brief), each taking at
// most one string parameter (a node path or a notebook key). Not worth a
// routing library.
import { useEffect, useState } from 'react';

export type Screen = 'read' | 'estante' | 'console' | 'grafo' | 'ajustes';
const SCREENS: Screen[] = ['read', 'estante', 'console', 'grafo', 'ajustes'];

export interface Route {
  screen: Screen;
  param: string | null;
}

// A reload keeps the URL's own hash (the browser does this for free), so
// this is only a fallback for when there IS no hash yet — a brand new tab,
// or the app opened from a bare bookmark — so that case also reopens where
// the user left off instead of always landing on the empty Reader.
const LAST_ROUTE_KEY = 'mindview.lastRoute.v1';

function loadLastRoute(): Route | null {
  try {
    const raw = localStorage.getItem(LAST_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!SCREENS.includes(parsed.screen)) return null;
    return { screen: parsed.screen, param: typeof parsed.param === 'string' ? parsed.param : null };
  } catch {
    return null;
  }
}

function saveLastRoute(route: Route): void {
  try {
    localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(route));
  } catch {
    /* best-effort; ignore quota/private-mode errors */
  }
}

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [rawScreen, rawParam] = clean.split('/');
  const screen = SCREENS.includes(rawScreen as Screen) ? (rawScreen as Screen) : 'read';
  const param = rawParam ? decodeURIComponent(rawParam) : null;
  return { screen, param };
}

export function navigate(screen: Screen, param?: string): void {
  window.location.hash = param ? `/${screen}/${encodeURIComponent(param)}` : `/${screen}`;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => {
    if (!window.location.hash) {
      const last = loadLastRoute();
      if (last) {
        navigate(last.screen, last.param ?? undefined);
        return last;
      }
    }
    return parseHash(window.location.hash);
  });
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => {
    saveLastRoute(route);
  }, [route]);
  return route;
}
