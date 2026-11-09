export interface StringFinding {
  /** Path relative to the lint root, posix-slashed. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** Trimmed source line (at most 160 characters). */
  snippet: string;
}

/** Lint `paths` (files or directories) under `opts.root` (default: the cwd). Defaults to `src` and `godot`. */
export function lintFiles(paths?: string[], opts?: { root?: string }): StringFinding[];
