/**
 * The run's dates. Appears both in the reveal copy and again on the lineup
 * title card, so it lives here rather than being typed out twice — the range
 * has already moved once and drifting copies would be the way it goes wrong.
 */
export const DATE_FROM = "Sep 4";
export const DATE_TO = "Sep 13";

export default function DateRange({ className = "" }: { className?: string }) {
  return (
    <p className={`dates ${className}`.trim()}>
      <span className="datesRule" aria-hidden />
      <span className="datesText">
        {DATE_FROM}
        <span className="datesDash">&ndash;</span>
        {DATE_TO}
      </span>
      <span className="datesRule" aria-hidden />
    </p>
  );
}
