import { CHARTER_IDS, type CharterId } from './data';
// A career is a seed plus an action list. The career code is a compact text form of it; replaying it reproduces the final state exactly.
import { buildDistrict } from './district';
import { acceptConnection, dispatchCrew, switchTie } from './events';
import { cancelProject, inspect, setReadiness, setVegetationBudget, startProject } from './projects';
import { stateHash, fail, type ActionResult, type CareerState, type ProjectKind, PROJECT_KINDS } from './state';
import { endQuarter } from './turn';

export type CareerAction =
  | { a: 'start'; kind: ProjectKind; target: string } | { a: 'cancel'; id: string } | { a: 'inspect'; asset: string } | { a: 'veg'; level: number } | { a: 'ready'; level: number }
  | { a: 'accept'; id: string } | { a: 'tie'; id: string } | { a: 'crew'; id: string } | { a: 'end'; interactive?: boolean };

export function applyAction(s: CareerState, act: CareerAction): ActionResult {
  switch (act.a) {
    case 'start': return startProject(s, act.kind, act.target);
    case 'cancel': return cancelProject(s, act.id);
    case 'inspect': return inspect(s, act.asset);
    case 'veg': return setVegetationBudget(s, act.level);
    case 'ready': return setReadiness(s, act.level);
    case 'accept': return acceptConnection(s, act.id);
    case 'tie': return switchTie(s, act.id);
    case 'crew': return dispatchCrew(s, act.id);
    case 'end': return endQuarter(s, !!act.interactive);
    default: return fail(s, 'career.err.action');
  }
}

/** Replay an action list from a seed. Rejected actions are no-ops (deterministically), `rejected` counts them. */
export function replayCareer(seed: number, actions: CareerAction[], charter: CharterId = 'standard'): { state: CareerState; rejected: number } {
  let s = buildDistrict(seed, charter), rejected = 0;
  for (const a of actions) { const r = applyAction(s, a); if (r.ok) s = r.state; else rejected++; }
  return { state: s, rejected };
}
export const careerHash = (seed: number, actions: CareerAction[], charter: CharterId = 'standard'): string => stateHash(replayCareer(seed, actions, charter).state);

const tok = (a: CareerAction): string => {
  switch (a.a) {
    case 'start': return `s:${a.kind}:${a.target}`;
    case 'cancel': return `c:${a.id}`;
    case 'inspect': return `i:${a.asset}`;
    case 'veg': return `v:${a.level}`;
    case 'ready': return `r:${a.level}`;
    case 'accept': return `a:${a.id}`;
    case 'tie': return `t:${a.id}`;
    case 'crew': return `d:${a.id}`;
    case 'end': return a.interactive ? 'E' : 'e';
  }
};
/** Career code: `C1/<seed>/<actions>` (Home Counties) or, from 1.3, `C2/<seed>/<charter>/<actions>`; action tokens separated by ;. */
export const encodeCareer = (seed: number, actions: CareerAction[], charter: CharterId = 'standard'): string =>
  charter === 'standard' ? `C1/${seed}/${actions.map(tok).join(';')}` : `C2/${seed}/${charter}/${actions.map(tok).join(';')}`;
export function decodeCareer(code: string): { seed: number; actions: CareerAction[]; charter: CharterId } | null {
  const m2 = /^C2\/(\d+)\/([a-z]+)\/(.*)$/.exec(code);
  if (m2 && !(CHARTER_IDS as string[]).includes(m2[2]!)) return null;
  const m = m2 ? [m2[0], m2[1], m2[3]] : /^C1\/(\d+)\/(.*)$/.exec(code);
  if (!m) return null;
  const charter = (m2 ? m2[2] : 'standard') as CharterId;
  const actions: CareerAction[] = [];
  for (const t of m[2]!.split(';').filter((x) => x.length)) {
    const [k, a, b] = t.split(':');
    if (t === 'e') actions.push({ a: 'end' });
    else if (t === 'E') actions.push({ a: 'end', interactive: true });
    else if (k === 's' && a && b && (PROJECT_KINDS as string[]).includes(a)) actions.push({ a: 'start', kind: a as ProjectKind, target: b });
    else if (k === 'c' && a) actions.push({ a: 'cancel', id: a });
    else if (k === 'i' && a) actions.push({ a: 'inspect', asset: a });
    else if (k === 'v' && a) actions.push({ a: 'veg', level: Number(a) });
    else if (k === 'r' && a) actions.push({ a: 'ready', level: Number(a) });
    else if (k === 'a' && a) actions.push({ a: 'accept', id: a });
    else if (k === 't' && a) actions.push({ a: 'tie', id: a });
    else if (k === 'd' && a) actions.push({ a: 'crew', id: a });
    else return null;
  }
  return { seed: Number(m[1]), actions, charter };
}
