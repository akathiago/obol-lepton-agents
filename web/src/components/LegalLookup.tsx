import { useState } from "react";
import { legalAsk } from "../data/source";
import type { AnswerSegment, LegalAskResult, LegalVerdict } from "../data/types";

// A few DOIs that exercise the three gate paths, for one-click demoing.
const SAMPLES: { label: string; doi: string }[] = [
  { label: "Open license (CC-BY)", doi: "10.1371/journal.pone.0173664" },
  { label: "Author-archived (green)", doi: "10.1016/j.cell.2016.11.018" },
  { label: "Closed — paywalled", doi: "10.1038/nphys1170" },
];

const bareOrcid = (url?: string) => url?.replace("https://orcid.org/", "");

/** A cited span from an ingested (DOI) paper — links to doi.org, not arXiv. */
function DoiCitation({ seg }: { seg: Extract<AnswerSegment, { type: "cite" }> }) {
  const c = seg.citation;
  const orcid = bareOrcid(c.orcid);
  const partial = c.status === "partial";
  return (
    <span className={`cite cite--c${c.colorIndex} ${partial ? "cite--partial" : ""}`} tabIndex={0}>
      {c.text}
      <span className="cite__tip" role="tooltip">
        <span className="cite__tip-label">
          {partial ? `partial citation · ${Math.round((c.coverage ?? 0) * 100)}% match` : "verified citation"}
        </span>
        <span className="cite__tip-paper">{c.paperTitle}</span>
        <span className="cite__tip-meta">
          <span className="cite__tip-author">{c.author}</span>
          <a className="cite__tip-id" href={`https://doi.org/${c.paperId}`} target="_blank" rel="noreferrer">
            doi:{c.paperId} ↗
          </a>
        </span>
        {orcid && <span className="cite__tip-orcid">✓ ORCID {orcid}</span>}
        <span className="cite__tip-pay">→ paid the author, not the publisher</span>
      </span>
    </span>
  );
}

/** The legal-guard verdict card: serve (green) or stop (red), with the reason. */
function GateCard({ v }: { v: LegalVerdict }) {
  const serve = v.decision === "serve";
  return (
    <div className={`gate gate--${serve ? "serve" : "stop"}`}>
      <div className="gate__head">
        <span className="gate__icon">{serve ? "✓" : "⛔"}</span>
        <span className="gate__decision">{serve ? "Legal to use" : "OBOL stops"}</span>
        <span className="gate__status">{v.oaStatus}</span>
      </div>
      <p className="gate__reason">{v.reason}</p>
      {serve && v.legal && (
        <p className="gate__legal">
          <span className="gate__legal-basis">{v.legal.basis}</span>
          <span className="gate__legal-host">· {v.legal.hostType}</span>
          {v.legal.version && <span className="gate__legal-version">· {v.legal.version}</span>}
          {(v.legal.landingUrl || v.legal.url) && (
            <a href={(v.legal.landingUrl || v.legal.url)!} target="_blank" rel="noreferrer" className="gate__legal-link">
              legal copy ↗
            </a>
          )}
        </p>
      )}
    </div>
  );
}

export default function LegalLookup() {
  const [doi, setDoi] = useState(SAMPLES[0].doi);
  const [question, setQuestion] = useState("");
  const [gate, setGate] = useState<LegalVerdict | null>(null);
  const [streaming, setStreaming] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<LegalAskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAsk(presetDoi?: string) {
    const d = (presetDoi ?? doi).trim();
    if (!d || loading) return;
    if (presetDoi) setDoi(presetDoi);
    setLoading(true);
    setGate(null);
    setResult(null);
    setNote(null);
    setError(null);
    setStreaming("");
    try {
      const r = await legalAsk(d, question, {
        onGate: (v) => setGate(v),
        onText: (full) => setStreaming(full),
        onNote: (t) => setNote(t),
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setStreaming("");
    }
  }

  return (
    <div className="legal">
      <div className="section-head">
        <span className="section-head__num">II</span>
        <h2 className="section-head__title">Outside the corpus</h2>
      </div>
      <p className="query__hint">
        Address a paper that isn't in OBOL's corpus by DOI. The legal guard asks Unpaywall whether
        a legal open version exists — an author-archived copy or an open license. If it does, OBOL
        reads that copy and pays the author. If not, it stops. It never pirates.
      </p>

      <div className="ask">
        <input
          className="ask__input ask__input--doi"
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAsk()}
          placeholder="DOI, e.g. 10.1371/journal.pone.0173664"
        />
        <input
          className="ask__input ask__input--doi"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAsk()}
          placeholder="Optional question (defaults to a summary)"
        />
        <div className="ask__row">
          <span className="ask__tip">Enter</span>
          <button className="ask__btn" onClick={() => onAsk()} disabled={loading}>
            {loading ? "Checking…" : "Check & ask"}
          </button>
        </div>
      </div>

      <div className="chips">
        {SAMPLES.map((s) => (
          <button key={s.doi} className="chip" onClick={() => onAsk(s.doi)} disabled={loading}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="answer">
        {loading && !gate && (
          <p className="answer__empty answer__empty--pulse">Asking Unpaywall for a legal version…</p>
        )}

        {gate && <GateCard v={gate} />}

        {loading && streaming && (
          <p className="answer__text answer__streaming">
            {streaming}
            <span className="caret">▍</span>
          </p>
        )}

        {note && <p className="no-match">{note}</p>}

        {error && <p className="answer__empty answer__error">Something went wrong: {error}</p>}

        {result && result.ingested && (
          <article className="answer__body">
            <p className="answer__text">
              {result.segments.map((s, i) =>
                s.type === "text" ? <span key={i}>{s.text}</span> : <DoiCitation key={i} seg={s} />,
              )}
            </p>

            <div className="verify-banner">
              <span className="verify-banner__check">✓</span>
              <span className="verify-banner__text">
                {result.stats.found === 0 ? (
                  <>Answer grounded in the legal copy · no inline citations this time</>
                ) : (
                  <>
                    <b>{result.stats.verified}</b> of {result.stats.found} citations verified as literal spans
                    {result.stats.partial > 0 && <> · {result.stats.partial} partial</>}
                    {result.stats.dropped > 0 && (
                      <> · <span className="verify-banner__dropped">{result.stats.dropped} dropped</span></>
                    )}
                  </>
                )}
              </span>
            </div>

            {result.sourceUrl && (
              <p className="legal__source">
                Answered over the legal copy ·{" "}
                <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                  {result.sourceUrl}
                </a>
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
