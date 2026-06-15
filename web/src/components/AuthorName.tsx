// An author's name. When we know their ORCID, the name links to their ORCID
// record (the verified identity that received the payment); otherwise it's plain
// text. The ✓ badge appears exactly when a link does — both mean "has ORCID".

type Props = {
  name: string;
  orcid?: string; // full URL or bare iD
  className?: string;
  showBadge?: boolean;
};

/** Normalizes a stored ORCID (full URL or bare iD) to its public portal URL. */
export function orcidUrl(orcid?: string): string | null {
  if (!orcid || !orcid.trim()) return null;
  const o = orcid.trim();
  return o.startsWith("http") ? o : `https://orcid.org/${o}`;
}

export default function AuthorName({ name, orcid, className, showBadge = true }: Props) {
  const url = orcidUrl(orcid);
  const badge = showBadge && url ? <span className="vbadge" title="ORCID verified">✓</span> : null;

  if (!url) {
    return (
      <span className={className}>
        {name}
        {badge}
      </span>
    );
  }

  return (
    <>
      <a
        className={`author-link ${className ?? ""}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        title={`Open ORCID record · ${url.replace("https://orcid.org/", "")}`}
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </a>
      {badge}
    </>
  );
}
