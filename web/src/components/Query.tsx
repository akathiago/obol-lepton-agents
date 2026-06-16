import { useState } from "react";
import { ask } from "../data/source";
import { MODEL_CHOICES, type AskResult, type DecisionLog as Log } from "../data/types";
import Citation from "./Citation";
import DecisionLog from "./DecisionLog";

/** Maps a model id back to its short label for the cost badge. */
const modelLabel = (id?: string) => MODEL_CHOICES.find((m) => m.id === id)?.label ?? id;

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
function CostBadge({ usage, model }: { usage: AskResult["usage"]; model?: string }) {
  const tail = model ? ` · ${modelLabel(model)}` : "";
  const cachedTail = usage.cachedTokens ? ` · ${usage.cachedTokens.toLocaleString("en-US")} cached` : "";
  const text = usage.cached
    ? `Cached · $0.0000 · no new tokens${tail}`
    : usage.inputTokens === 0
      ? `No answer generated · $0.0000${tail}`
      : `Query cost · ${usage.inputTokens.toLocaleString("en-US")} tokens${cachedTail} · $${usage.costUsd.toFixed(4)}${tail}`;
  return <p className="cost-badge">{text}</p>;
}

/** The closed loop's economics for the query (Agent mode): toll in vs. costs out. */
function Economics({ e }: { e: NonNullable<AskResult["economics"]> }) {
  const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(4)}`;
  return (
    <div className="econ">
      <p className="econ__head">Agent-mode economics · the closed loop</p>
      <ul className="econ__rows">
        <li className="econ__row">
          <span>An agent pays OBOL</span>
          <span className="econ__in">{usd(e.toll)}</span>
        </li>
        <li className="econ__row econ__row--sub">
          <span>→ to cited authors</span>
          <span>{usd(-e.authors)}</span>
        </li>
        <li className="econ__row econ__row--sub">
          <span>→ inference (off-chain)</span>
          <span>{usd(-e.inference)}</span>
        </li>
        <li className={`econ__row econ__margin ${e.margin >= 0 ? "is-pos" : "is-neg"}`}>
          <span>OBOL margin</span>
          <span>{usd(e.margin)}</span>
        </li>
      </ul>
    </div>
  );
}

export default function Query() {
  const [question, setQuestion] = useState(SUGGESTED[0]);
  const [model, setModel] = useState(MODEL_CHOICES[0].id);
  const [result, setResult] = useState<AskResult | null>(null);
  const [decision, setDecision] = useState<Log | null>(null);
  const [streaming, setStreaming] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAsk(preset?: string) {
    const q = (preset ?? question).trim();
    if (!q || loading) return;
    if (preset) setQuestion(preset);
    setLoading(true);
    setResult(null);
    setDecision(null);
    setError(null);
    setStreaming("");
    try {
      const r = await ask(q, (full) => setStreaming(full), (d) => setDecision(d), model);
      setResult(r);
      if (r.decision) setDecision(r.decision); // covers the cached path
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
          <label className="ask__model">
            <span className="ask__model-label">Model</span>
            <select
              className="ask__model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
            >
              {MODEL_CHOICES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.note}
                </option>
              ))}
            </select>
          </label>
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

        {loading && !streaming && !decision && (
          <p className="answer__empty answer__empty--pulse">
            Retrieving 8 candidates · the agent is deciding which are worth paying to cite…
          </p>
        )}

        {/* the agency, made visible: what the agent saw, funded, and discarded */}
        {decision && <DecisionLog decision={decision} />}

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
            <CostBadge usage={result.usage} model={result.model} />
          </article>
        )}

        {/* the agent funded nothing — honest non-answer */}
        {result && result.noFunded && (
          <article className="answer__body">
            <p className="answer__q">{result.question}</p>
            <p className="no-match">
              The agent judged that none of the retrieved papers were worth paying to cite for this
              question — so it answered nothing and paid no one. The decision above shows why.
            </p>
          </article>
        )}

        {/* normal answer */}
        {result && !result.noMatch && !result.noFunded && (
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
            <CostBadge usage={result.usage} model={result.model} />
            {result.economics && <Economics e={result.economics} />}
          </article>
        )}
      </div>
    </div>
  );
}
