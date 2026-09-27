/* The finished brief: computed numbers plus checked words.
   Same assembly as step 5 of run.mjs, as a function the phone can call. */

const RANK = { ok: 0, info: 0, warn: 1, crit: 2 }
const worse = (a, c) => (c && (RANK[c] || 0) > (RANK[a] || 0) ? c : a)

/**
 * @param base   skeleton(summary) from compute.mjs
 * @param words  check(...) output, with `headline` filled (model or plainHeadline)
 */
export function assemble(base, words, generatedAt) {
  return {
    generated_at: generatedAt,
    headline_bn: words.headline.bn,
    headline_en: words.headline.en,
    cards: base.cards,
    projects: base.projects.map((p) => {
      const note = words.notes.get(p.id)
      return {
        name_bn: p.name_bn,
        name_en: p.name_en,
        pct_done: p.pct_done,
        pct_spent: p.pct_spent,
        // A note may sharpen the status but never soften it.
        status: worse(p.status, note && note.status),
        note_bn: note ? note.note_bn : '',
        note_en: note ? note.note_en : '',
      }
    }),
    alerts: words.alerts,
    series: base.series,
    todo_bn: words.todo_bn,
    todo_en: words.todo_en,
  }
}
