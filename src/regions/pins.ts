// Committed pins: the ruleset version and the hash of the rule-relevant data of every pack (packDataHash: limits, prices,
// catalogue values; not strings, names or source tags). regions.test.ts compares the live packs with this table:
//   - data changed, rulesetVersion not bumped  -> test FAILS (old scores would be silently compared with new rules)
//   - strings/names changed                    -> nothing changes (hash ignores them)
// When you change data deliberately: bump the pack's rulesetVersion, then update its line here (the failing test prints it).
import type { RulesetPin } from './data';

export const PINS: Record<string, RulesetPin> = {
  global: { rulesetVersion: 2, dataHash: 'e9aa8c13846733d9' },
  in: { rulesetVersion: 2, dataHash: 'ff35044e12f84bf4' },
};
