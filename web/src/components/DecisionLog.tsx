import type { DecisionLog as Log, LoggedCandidate, CandidateStatus } from "../data/types";

const shortTitle = (t: string) => {
  const head = t.split(":")[0].trim();
  return head.length > 52 ? head.slice(0, 50).trimEnd() + "…" : head;
};

// How each status reads in the log: label + the CSS modifier that colors it.
const STATUS: Record<CandidateStatus, { label: string; mod: string }> = {
  funded: { label: "funded", mod: "fund" },
  discarded_relevance: { label: "discarded · tangential", mod: "drop" },
  discarded_cost: { label: "not worth the toll", mod: "cost" },
  skipped_budget: { label: "over budget", mod: "budget" },
};

function Row({ c }: { c: LoggedCandidate }) {
  const s = STATUS[c.status];
  const paid = c.status === "funded" && c.paid;
  const fundedNotCited = c.status === "funded" && !c.paid;
  const label = paid ? "cited · paid" : fundedNotCited ? "funded · not cited" : s.label;
  const mod = paid ? "paid" : s.mod;

  return (
    <li className={`dec-row dec-row--${mod}`}>
      <span className="dec-row__rel" title="relevance to this question">
        <span className="dec-row__rel-bar" style={{ width: `${Math.round(c.relevance * 100)}%` }} />
        <span className="dec-row__rel-num">{c.relevance.toFixed(2)}</span>
      </span>
      <span className="dec-row__main">
        <a className="dec-row__paper" href={`https://arxiv.org/abs/${c.paperId}`} target="_blank" rel="noreferrer">
          {shortTitle(c.title)}
        </a>
        <span className="dec-row__reason">{c.reason}</span>
      </span>
      <span className={`dec-row__status dec-row__status--${mod}`}>
        {label}
        {paid && <span className="dec-row__amt"> ${c.amount.toFixed(4)}</span>}
      </span>
    </li>
  );
}

export default function DecisionLog({ decision }: { decision: Log }) {
  const { spend, attestation } = decision;
  const pct = spend.budget ? Math.min(100, (spend.committed / spend.budget) * 100) : 0;
  const att = attestation;

  return (
    <div className="dec">
      <div className="dec__head">
        <span className="dec__title">Allocation decision</span>
        <span className="dec__budget">
          ${spend.committed.toFixed(4)} <span className="dec__budget-of">/ ${spend.budget.toFixed(4)} budget</span>
        </span>
      </div>

      <div className="dec__bar">
        <span className="dec__bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <p className="dec__strategy">“{decision.strategy}”</p>

      <ul className="dec__rows">
        {decision.candidates.map((c) => (
          <Row key={c.paperId} c={c} />
        ))}
      </ul>

      <div className="dec__foot">
        <span className="dec__counts">
          saw <b>{spend.seen}</b> · funded <b>{spend.funded}</b> · paid <b>{spend.paid}</b> · discarded{" "}
          {spend.discardedRelevance + spend.discardedCost} · over budget {spend.skippedBudget}
        </span>
        {att && (
          <span className="dec__attest" title={att.signature ? `signed by ${att.signer}` : att.hash}>
            {att.signature ? "✓ signed" : "hashed"} · {att.hash.slice(0, 10)}…
          </span>
        )}
      </div>
    </div>
  );
}
