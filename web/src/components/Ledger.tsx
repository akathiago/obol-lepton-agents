import { AnimatePresence, motion } from "motion/react";
import { useLedger } from "../hooks/useLedger";
import Counter from "./Counter";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Shortens long titles for the tape (cut at ":" or by length). */
function shortTitle(t: string): string {
  const head = t.split(":")[0].trim();
  return head.length > 46 ? head.slice(0, 44).trimEnd() + "…" : head;
}

export default function Ledger() {
  const { feed, leaderboard, totals } = useLedger();
  const leadTotal = leaderboard[0]?.total ?? 0;

  return (
    <div className="ledger">
      <div className="section-head">
        <span className="section-head__num">II</span>
        <h2 className="section-head__title">Authors' ledger</h2>
      </div>
      <p className="ledger__note">
        Driven by real queries · amounts simulated, settle on-chain via pay.ts
      </p>

      {/* ──────── counters ──────── */}
      <div className="totals">
        <div className="stat">
          <Counter className="stat__num" value={totals.authors} />
          <span className="stat__label">authors paid</span>
        </div>
        <div className="stat">
          <Counter className="stat__num" value={totals.payments} />
          <span className="stat__label">nanopayments</span>
        </div>
        <div className="stat stat--accent">
          <Counter className="stat__num" value={totals.distributed} decimals={4} prefix="$" />
          <span className="stat__label">USDC distributed</span>
        </div>
      </div>

      {/* ──────── payment tape ──────── */}
      <div className="ledger__block ledger__block--feed">
        <div className="block-head">
          <span className="block-head__title">Payment tape</span>
          <span className="block-head__live">
            <i /> live
          </span>
        </div>

        <ul className="feed">
          <AnimatePresence initial={false}>
            {feed.map((p) => (
              <motion.li
                key={p.id}
                layout
                className="tick"
                initial={{ opacity: 0, y: -14, backgroundColor: "rgba(47,107,88,0.18)" }}
                animate={{ opacity: 1, y: 0, backgroundColor: "rgba(47,107,88,0)" }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <span className="tick__arrow">→</span>
                <span className="tick__amt">${p.amount.toFixed(4)}</span>
                <span className="tick__body">
                  to <b className="tick__author">{p.author}</b>
                  {p.orcid && <span className="vbadge" title="ORCID verified">✓</span>}
                  {p.pending && <span className="tick__pending" title="settling / waiting for the author"> · escrow</span>}
                  <span className="tick__sep">·</span>
                  cited <i className="tick__paper">{shortTitle(p.paperTitle)}</i>
                </span>
                {p.wallet && (
                  <a
                    className="tick__link"
                    href={`https://testnet.arcscan.app/address/${p.wallet}`}
                    target="_blank"
                    rel="noreferrer"
                    title={p.pending ? "escrow — waiting for the author" : p.txHash || p.wallet}
                  >
                    {p.pending ? "escrow" : "wallet ↗"}
                  </a>
                )}
              </motion.li>
            ))}
          </AnimatePresence>

          {feed.length === 0 && (
            <li className="feed__empty">waiting for the first nanopayment…</li>
          )}
        </ul>
      </div>

      {/* ──────── leaderboard ──────── */}
      <div className="ledger__block ledger__block--board">
        <div className="block-head">
          <span className="block-head__title">Most-cited authors</span>
          <span className="block-head__hint">by total received</span>
        </div>

        <ol className="board">
          <AnimatePresence initial={false}>
            {leaderboard.map((a, i) => (
              <motion.li
                key={a.author}
                layout
                className={`board__row ${i === 0 ? "board__row--lead" : ""}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 460, damping: 38 },
                  opacity: { duration: 0.4 },
                }}
              >
                <span className="board__rank">{i + 1}</span>
                <span className="board__name">
                  {a.author}
                  {a.orcid && <span className="vbadge" title="ORCID verified">✓</span>}
                  {i === 0 && <span className="board__seal">◆</span>}
                </span>
                <span className="board__citas">
                  {a.citations} {a.citations === 1 ? "citation" : "citations"}
                </span>
                <span className="board__bar">
                  <span
                    className="board__bar-fill"
                    style={{ width: `${leadTotal ? (a.total / leadTotal) * 100 : 0}%` }}
                  />
                </span>
                <span className="board__total">${a.total.toFixed(4)}</span>
              </motion.li>
            ))}
          </AnimatePresence>

          {leaderboard.length === 0 && (
            <li className="feed__empty">the ranking builds with the first payments…</li>
          )}
        </ol>
      </div>
    </div>
  );
}
