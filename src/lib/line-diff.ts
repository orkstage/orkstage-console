// SPDX-License-Identifier: AGPL-3.0-only

export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
  /** Line number in the old text (same, removed) or in the new text (added). */
  line: number;
}

/**
 * Line diff of two texts (longest common subsequence), for comparing template versions. Templates
 * are short, so the quadratic table is fine; above the limit, the texts are shown as replaced.
 */
export function lineDiff(before: string, after: string, limit = 4_000): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length > limit || b.length > limit) {
    return [...a.map((text, i) => ({ kind: 'removed' as const, text, line: i + 1 })), ...b.map((text, i) => ({ kind: 'added' as const, text, line: i + 1 }))];
  }
  // lcs[i][j]: length of the common subsequence of a[i..] and b[j..].
  const lcs: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]!, line: i + 1 });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: 'removed', text: a[i]!, line: i + 1 });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j]!, line: j + 1 });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ kind: 'removed', text: a[i]!, line: i + 1 });
  for (; j < b.length; j++) out.push({ kind: 'added', text: b[j]!, line: j + 1 });
  return out;
}
