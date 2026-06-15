import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { claimFees, signInWithOrcid } from "../data/source";
import type { ClaimAccount } from "../data/types";

type Phase = "intro" | "auth" | "ready" | "claiming" | "done";

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function ClaimPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [account, setAccount] = useState<ClaimAccount | null>(null);
  const [txHash, setTxHash] = useState("");

  // Reset to the start every time the panel opens.
  useEffect(() => {
    if (open) {
      setPhase("intro");
      setAccount(null);
      setTxHash("");
    }
  }, [open]);

  async function onSignIn() {
    setPhase("auth");
    setAccount(await signInWithOrcid());
    setPhase("ready");
  }

  async function onClaim() {
    if (!account) return;
    setPhase("claiming");
    const { txHash } = await claimFees(account);
    setTxHash(txHash);
    setPhase("done");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="claim"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="claim__close" onClick={onClose} aria-label="Close">
              ×
            </button>
            <p className="claim__kicker">For authors</p>

            {/* ── intro ── */}
            {phase === "intro" && (
              <>
                <h3 className="claim__title">Claim your citation fees</h3>
                <p className="claim__text">
                  Óbolo pays authors directly for every verified citation. Sign in with your
                  ORCID iD to claim what your work has already earned.
                </p>
                <button className="orcid-btn" onClick={onSignIn}>
                  <span className="orcid-mark">iD</span>
                  Sign in with ORCID
                </button>
                <p className="claim__note">Sandbox demo · no real login is performed</p>
              </>
            )}

            {/* ── authenticating ── */}
            {phase === "auth" && (
              <div className="claim__loading">
                <span className="orcid-mark orcid-mark--lg">iD</span>
                <p className="claim__text claim__text--pulse">Authenticating with ORCID…</p>
              </div>
            )}

            {/* ── ready to claim ── */}
            {phase === "ready" && account && (
              <>
                <div className="verified-card">
                  <span className="verified-card__check">✓</span>
                  <div>
                    <span className="verified-card__name">{account.author}</span>
                    <span className="verified-card__orcid">ORCID iD {account.orcid}</span>
                  </div>
                </div>

                <div className="accrued">
                  <span className="accrued__label">Your work has earned</span>
                  <span className="accrued__num">${account.accrued.toFixed(4)}</span>
                  <span className="accrued__sub">
                    USDC · across {account.citations.toLocaleString("en-US")} verified
                    citations
                  </span>
                </div>

                <div className="wallet-row">
                  <span className="wallet-row__label">Payout wallet</span>
                  <span className="wallet-row__addr">{shortAddr(account.wallet)}</span>
                  <span className="wallet-row__note">custodial · via Circle · no crypto needed</span>
                </div>

                <button className="claim__btn" onClick={onClaim}>
                  Claim ${account.accrued.toFixed(4)} USDC
                </button>
              </>
            )}

            {/* ── claiming ── */}
            {phase === "claiming" && (
              <div className="claim__loading">
                <p className="claim__text claim__text--pulse">Settling on Arc…</p>
              </div>
            )}

            {/* ── done ── */}
            {phase === "done" && account && (
              <div className="claimed">
                <span className="claimed__check">✓</span>
                <h3 className="claim__title">Claimed</h3>
                <p className="claim__text">
                  <b>${account.accrued.toFixed(4)} USDC</b> sent to {shortAddr(account.wallet)}.
                </p>
                <a
                  className="claimed__link"
                  href={`https://explorer.arc.network/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  view on explorer ↗
                </a>
                <button className="claim__btn claim__btn--ghost" onClick={onClose}>
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
