/**
 * Client-side token estimate.
 *
 * The paper's token figures come from the real GPT-4o tokenizer, run at capture
 * time — see `capture.corpus.stats.tokens`. This is a different thing: a rough
 * count for JSON blocks the reader toggles open in the browser, where shipping a
 * tokenizer to do it exactly would cost more than the number is worth.
 *
 * Four characters per token is the usual approximation for English prose and
 * runs a little low on dense JSON, where punctuation and short keys tokenise
 * more finely. It is labelled as approximate everywhere it is shown.
 */
export function estimateLlmTokens(s: string): number {
  return Math.ceil(s.length / 4)
}
