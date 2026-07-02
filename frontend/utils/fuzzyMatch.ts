/**
 * Subsequence match: every character of `query` appears in `text`, in order, but not necessarily
 * contiguous (e.g. "ntbk" matches "notebook"). Used as a fallback when a plain substring match
 * finds nothing, since it covers more real queries without pulling in a fuzzy-search dependency.
 */
function isSubsequence(query: string, text: string): boolean {
    let i = 0;
    for (let j = 0; j < text.length && i < query.length; j++) {
        if (text[j] === query[i]) i++;
    }
    return i === query.length;
}

/**
 * Tries a plain substring match first (predictable, matches whole words/phrases), falling back to
 * a subsequence match only if the substring match found nothing.
 */
export function fuzzyMatch(query: string, text: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const t = text.toLowerCase();
    return t.includes(q) || isSubsequence(q, t);
}
