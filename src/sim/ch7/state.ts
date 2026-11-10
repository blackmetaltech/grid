// Chapter 7 level state, carried in `state.ch7` (absent in every other level, so their states and goldens do not change). It holds ONLY the player's design:
// every result (fault kA, clearing times, swing, dispatch cost) is recomputed from it by the studies in this folder, never stored.
export type Ch7Id = 'L23' | 'L24' | 'L25' | 'L26' | 'L27';

export interface RelaySetting { curve: 'SI' | 'VI' | 'EI'; /** plug setting, percent of the CT rating */ pct: number; tms: number }
export interface L23Design { rating: number; uk: number; coupler: 'closed' | 'open'; reactor: number }
export interface L24Design { relays: RelaySetting[] }
export interface L25Design { relay: string; cycles: number; reclose: boolean }
export type Window = [number, number];
export type DispatchMode = 'merit' | 'lambda' | 'corridor';
export interface L26Design { mode: DispatchMode; windows: Record<string, Window> }
export interface L27Design { rating: number; dispatch: [number, number, number] }

export interface Ch7State {
  id: Ch7Id;
  /** Pack currency per US$ (the game prices of this chapter are US$; a region scales them). */
  money: number;
  l23?: L23Design; l24?: L24Design; l25?: L25Design; l26?: L26Design; l27?: L27Design;
}
