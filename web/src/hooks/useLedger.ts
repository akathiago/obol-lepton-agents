import { useEffect, useMemo, useState } from "react";
import { paymentSource } from "../data/source";
import type { AuthorStat, Payment } from "../data/types";

const FEED_LIMIT = 40; // how many feed lines we keep on the tape
const BOARD_LIMIT = 12; // leaderboard top N

/**
 * Subscribes to the payment source and derives everything the Ledger needs:
 *  - feed: latest payments (capped, for the tape)
 *  - leaderboard: authors ranked by total (accumulated, never dropped)
 *  - totals: global counters
 */
export function useLedger() {
  const [feed, setFeed] = useState<Payment[]>([]);
  const [byAuthor, setByAuthor] = useState<Map<string, AuthorStat>>(new Map());
  const [paymentCount, setPaymentCount] = useState(0);
  const [distributed, setDistributed] = useState(0);

  useEffect(() => {
    return paymentSource.subscribe((p) => {
      setFeed((prev) => [p, ...prev].slice(0, FEED_LIMIT));

      setByAuthor((prev) => {
        const next = new Map(prev);
        const cur = next.get(p.author);
        next.set(p.author, {
          author: p.author,
          citations: (cur?.citations ?? 0) + 1,
          total: (cur?.total ?? 0) + p.amount,
          lastPaperTitle: p.paperTitle,
          orcid: p.orcid ?? cur?.orcid,
        });
        return next;
      });

      setPaymentCount((c) => c + 1);
      setDistributed((d) => d + p.amount);
    });
  }, []);

  const leaderboard = useMemo(
    () =>
      [...byAuthor.values()]
        .sort((a, b) => b.total - a.total || b.citations - a.citations)
        .slice(0, BOARD_LIMIT),
    [byAuthor],
  );

  const totals = {
    authors: byAuthor.size,
    payments: paymentCount,
    distributed,
  };

  return { feed, leaderboard, totals };
}
