import { useState } from "react";
import { ask } from "../data/source";
import type { AskResult } from "../data/types";
import Citation from "./Citation";

const SUGGESTED = [
  "Why do LLM agents fail on long-horizon tasks?",
  "How do multi-agent systems coordinate and share memory?",
  "What makes tool use reliable in LLM agents?",
  "How is the performance of LLM agents benchmarked?",
];

/** Shortens long paper titles for the sources list. */
const shortTitle = (t: string) => {
  const head = t.split(":")[0].trim();
  return head.length > 58 ? head.slice(0, 56).trimEnd() + "…" : head;
};

/** "Sources consulted" — retrieve made visible. Titles link to the real arXiv paper. */
function Sources({ sources, head }: { sources: AskResult["sources"]; head: string }) {
  const maxScore = Math.max(...sources.map((s) => s.score), 1);
  return (
    <div className="sources">
      <p className="sources__head">{head}</p>
      <ul className="sources__list">
        {sources.map((s) => (
          <li key={s.paperId} className="source">
            <span className="source__bar">
              <span className="source__bar-fill" style={{ width: `${(s.score / maxScore) * 100}%` }} />
            </span>
            <a
              className="source__title"
              href={`https://arxiv.org/abs/${s.paperId}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortTitle(s.title)}
            </a>
            {s.cited && <span className="source__cited">cited</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Per-query token + cost badge. */
function CostBadge({ usage }: { usage: AskResult["usage"] }) {
  const text = usage.cached
    ? "Cached · $0.0000 · no new tokens"
    : usage.inputTokens === 0
      ? "No answer generated · $0.0000"
      : `Query cost · ${usage.inputTokens.toLocaleString("en-US")} tokens · $${usage.costUsd.toFixed(4)}`;
  return <p className="cost-badge">{text}</p>;
}

export default function Query() {
  const [question, setQuestion] = useState(SUGGESTED[0]);
  const [result, setResult] = useState<AskResult | null>(null);
  const [streaming, setStreaming] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAsk(preset?: string) {
    const q = (preset ?? question).trim();
    if (!q || loading) return;
    if (preset) setQuestion(preset);
    setLoading(true);
    setResult(null);
    setError(null);
    setStreaming("");
    try {
      const r = await ask(q, (full) => setStreaming(full));
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setStreaming("");
    }
  }

  return (
    <div className="query">
      <div className="section-head">
        <span className="section-head__num">I</span>
        <h2 className="section-head__title">Reading room</h2>
      </div>
      <p className="query__hint">
        Ask. OBOL retrieves from open-access papers, answers with citations anchored to
        literal spans, and pays every cited author.
      </p>

      <div className="ask">
        <textarea
          className="ask__input"
          value={question}
          rows={3}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onAsk();
          }}
          placeholder="Type your research question…"
        />
        <div className="ask__row">
          <span className="ask__tip">⌘ + Enter</span>
          <button className="ask__btn" onClick={() => onAsk()} disabled={loading}>
            {loading ? "Asking…" : "Ask"}
          </button>
        </div>
      </div>

      <div className="chips">
        {SUGGESTED.map((q) => (
          <button key={q} className="chip" onClick={() => onAsk(q)} disabled={loading}>
            {q}
          </button>
        ))}
      </div>

      <div className="answer">
        {!result && !loading && !error && (
          <p className="answer__empty">
            The answer appears here, streaming in as OBOL writes it. Each cited fragment is
            underlined in its author's color — hover to see the paper, and watch its payment
            drop into the ledger.
          </p>
        )}

        {loading && !streaming && (
          <p className="answer__empty answer__empty--pulse">
            Retrieving from the corpus and verifying each citation is a literal span…
          </p>
        )}

        {loading && streaming && (
          <p className="answer__text answer__streaming">
            {streaming}
            <span className="caret">▍</span>
          </p>
        )}

        {error && <p className="answer__empty answer__error">Something went wrong: {error}</p>}

        {/* the corpus doesn't cover this — OBOL won't force an answer */}
        {result && result.noMatch && (
          <article className="answer__body">
            <p className="answer__q">{result.question}</p>
            <p className="no-match">
              The corpus doesn't seem to cover this question, so OBOL won't force an answer.
              No citations, no payments. Here's the closest it found:
            </p>
            <Sources sources={result.sources} head="Closest in the corpus · none cleared the relevance bar" />
            <CostBadge usage={result.usage} />
          </article>
        )}

        {/* normal answer */}
        {result && !result.noMatch && (
          <article className="answer__body">
            <p className="answer__q">{result.question}</p>
            <p className="answer__text">
              {result.segments.map((s, i) =>
                s.type === "text" ? (
                  <span key={i}>{s.text}</span>
                ) : (
                  <Citation key={i} citation={s.citation} />
                ),
              )}
            </p>

            {/* the guard, made visible */}
            <div className="verify-banner">
              <span className="verify-banner__check">✓</span>
              <span className="verify-banner__text">
                {result.stats.found === 0 ? (
                  <>Answer grounded in the corpus · no inline citations this time</>
                ) : (
                  <>
                    <b>{result.stats.verified}</b> of {result.stats.found} citations verified as
                    literal spans
                    {result.stats.partial > 0 && <> · {result.stats.partial} partial</>}
                    {result.stats.dropped > 0 && (
                      <>
                        {" · "}
                        <span className="verify-banner__dropped">
                          {result.stats.dropped} dropped (failed the guard)
                        </span>
                      </>
                    )}
                  </>
                )}
              </span>
            </div>

            <Sources sources={result.sources} head={`Sources consulted · ${result.sources.length} of the corpus`} />
            <CostBadge usage={result.usage} />
          </article>
        )}
      </div>
    </div>
  );
}
