import type { Citation as Cite } from "../data/types";

const bareOrcid = (url?: string) => url?.replace("https://orcid.org/", "");

/**
 * A cited fragment: underlined in its author's color, with a tooltip on hover.
 * Exact matches get a solid underline; partial matches a dotted one + coverage.
 */
export default function Citation({ citation }: { citation: Cite }) {
  const orcid = bareOrcid(citation.orcid);
  const partial = citation.status === "partial";

  return (
    <span
      className={`cite cite--c${citation.colorIndex} ${partial ? "cite--partial" : ""}`}
      tabIndex={0}
    >
      {citation.text}
      <span className="cite__tip" role="tooltip">
        <span className="cite__tip-label">
          {partial
            ? `partial citation · ${Math.round((citation.coverage ?? 0) * 100)}% match`
            : "verified citation"}
        </span>
        <span className="cite__tip-paper">{citation.paperTitle}</span>
        <span className="cite__tip-meta">
          <span className="cite__tip-author">{citation.author}</span>
          <a
            className="cite__tip-id"
            href={`https://arxiv.org/abs/${citation.paperId}`}
            target="_blank"
            rel="noreferrer"
          >
            arXiv:{citation.paperId} ↗
          </a>
        </span>
        {orcid && <span className="cite__tip-orcid">✓ ORCID {orcid}</span>}
        <span className="cite__tip-pay">→ paid $0.0005 USDC to the author</span>
      </span>
    </span>
  );
}
