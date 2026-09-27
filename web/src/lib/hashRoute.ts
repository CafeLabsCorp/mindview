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

// A reload keeps the URL's own hash (the browser does this for free). With
// no hash at all — the app just opened — it always lands on the Graph
// (Felipe, 2026-09-14). This used to restore the last screen from
// localStorage instead; the Graph as the fixed front door won.
const HOME: Screen = 'grafo';

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  if (!clean) return { screen: HOME, param: null };
  const [rawScreen, rawParam] = clean.split('/');
  const screen = SCREENS.includes(rawScreen as Screen) ? (rawScreen as Screen) : 'read';
  const param = rawParam ? decodeURIComponent(rawParam) : null;
  return { screen, param };
}

export function navigate(screen: Screen, param?: string): void {
  window.location.hash = param ? `/${screen}/${encodeURIComponent(param)}` : `/${screen}`;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
