import { useState } from "react";
import { motion } from "motion/react";
import Query from "./components/Query";
import Ledger from "./components/Ledger";
import ClaimPanel from "./components/ClaimPanel";

const EASE = [0.2, 0.7, 0.2, 1] as const;

export default function App() {
  const [claimOpen, setClaimOpen] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead__top">
          <span className="masthead__edition">Live edition</span>
          <div className="masthead__top-right">
            <span className="masthead__date">{today}</span>
            <button className="claim-cta" onClick={() => setClaimOpen(true)}>
              Authors · Claim fees →
            </button>
          </div>
        </div>

        <div className="masthead__plate">
          <span className="masthead__rule" />
          <div className="masthead__center">
            <p className="masthead__kicker">The citation toll · on Arc</p>
            <h1 className="wordmark">ÓBOLO</h1>
            <p className="masthead__sub">
              Every verified citation pays the author — directly, with no publisher in between
            </p>
          </div>
          <span className="masthead__rule" />
        </div>

        <div className="masthead__foot">
          <span>Corpus · 100 open-access papers · arXiv</span>
          <span className="live">
            <i /> Authors' ledger
          </span>
          <span>USDC · simulated</span>
        </div>
      </header>

      <main className="split">
        <motion.section
          className="panel panel--query"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <Query />
        </motion.section>

        <motion.section
          className="panel panel--ledger"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
        >
          <Ledger />
        </motion.section>
      </main>

      <ClaimPanel open={claimOpen} onClose={() => setClaimOpen(false)} />
    </div>
  );
}
