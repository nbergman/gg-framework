/**
 * Human-readable, hype-toned release notes shown in the dedicated, screen-centered
 * "What's new" window after the app updates to a new version (opened by
 * `WhatsNewModal.tsx`, rendered by `WhatsNewWindow.tsx`).
 *
 * MAINTENANCE: this list is rewritten by the `/release` flow — see
 * `.gg/commands/release.md` (Track B). When cutting a desktop release, the diff
 * since the last `v*` tag is parsed and rephrased into exciting, non-technical
 * copy, then a new entry is PREPENDED here for the new version. Keep entries
 * newest-first and the voice punchy — every line should make the update sound
 * worth installing, never a dry technical note.
 */
export interface ChangelogEntry {
  /** App version this entry ships in, e.g. "0.4.1" (no leading "v"). */
  version: string;
  /** Release date, ISO `YYYY-MM-DD`. */
  date: string;
  /** Hype-toned bullet points, one user-facing win per line. */
  items: string[];
}

/** Newest first. Prepended by the `/release` flow. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.4.1",
    date: "2026-06-24",
    items: [
      "The Prompt Enhancer now glides in glassy-smooth. I hunted down the split-second flash on handoff and erased it. Pure silk.",
      "Your input gently dims while the enhancer works its magic, so you always know exactly when it's cooking.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-06-22",
    items: [
      "Say hello to the Prompt Enhancer. Turn a half-formed thought into a razor-sharp prompt with one click, complete with a gorgeous dissolve animation.",
      "Rock-solid image handling. Tricky attachments that used to trip up a turn now sail straight through.",
      "Plan mode feels crisp again. Accepting a plan resets the session cleanly so you start every build with a fresh head of steam.",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-06-19",
    items: [
      "Long conversations just got cheaper and snappier. I squeezed a full hour of smart caching out of every chat so you spend less and wait less.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-06-17",
    items: [
      "Brand-new per-project Notes. Pop open a clean notebook for any project and jot ideas, todos, or scratch thoughts that stick around.",
      "Every modal now closes with the same satisfying, consistent button. Small touch, big polish.",
      "The commit button slid to its natural home on the right, right where your thumb expects it.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-14",
    items: [
      "Fresh AI firepower: the Sakana Fugu and Fugu Ultra models are now one tap away in the model menu.",
      "More creative range under the hood means more ways to get exactly the answer you're chasing.",
    ],
  },
];

/**
 * The most recent changelog bullets for the modal, capped at `maxItems` total
 * bullet points (default 20) across versions — newest first, version grouping
 * preserved. A version whose bullets would spill past the cap is included with
 * only the bullets that fit.
 */
export function recentChangelog(maxItems = 20): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  let count = 0;
  for (const entry of CHANGELOG) {
    if (count >= maxItems) break;
    const items = entry.items.slice(0, maxItems - count);
    if (items.length === 0) break;
    out.push({ ...entry, items });
    count += items.length;
  }
  return out;
}
