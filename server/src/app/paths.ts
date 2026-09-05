import { homedir } from 'node:os';
import { join } from 'node:path';

// Single local-only home for all MV state, never inside the vault (would
// dirty scripts/status-all.sh forever, collide with the maintenance agent's
// mandate, and risk `git merge upstream/main` conflicts in mind-template).
// A dedicated `mindview-data` git repo was cut on 2026-09-05: nobody wants
// to clone/configure a repo just to keep 4 preferences — durability comes
// from the Backup export/import feature (app/backup.ts) instead. Casa A
// (settings/cadernos) and Casa B (session/state/usage) still exist as
// logical distinctions in houseA.ts/stateB.ts, but now share one physical
// directory.
const MINDVIEW_HOME = join(homedir(), '.local', 'share', 'mindview');

export const HOUSE_A_ROOT = process.env.MINDVIEW_DATA_DIR ?? MINDVIEW_HOME;
export const HOUSE_B_ROOT = process.env.MINDVIEW_STATE_DIR ?? MINDVIEW_HOME;

export const DEFAULT_VAULT_PATH = '/home/felip/projetos/mind';
