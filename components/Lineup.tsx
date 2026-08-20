"use client";

import { useEffect, useRef, useState } from "react";

import DateRange from "./DateRange";

/**
 * The nights of the anniversary run, in the order they happen.
 *
 * `ticket` is the only thing here that reaches outside the site. Leave it
 * empty and the card shows an inert "Tickets soon" chip instead of a dead
 * link — the section is designed to ship before the ticketing pages exist.
 *
 * `photo` points at public/lineup/. A missing file is not an error: the card
 * falls back to the artist's initials on the same smoke plate, so the row
 * still reads as a full run while the shoot is being cleared.
 */
export type Event = {
  /* The act's name, set large — it is the headline of the card. */
  artist: string;
  date: string;
  photo: string;
  ticket: string;
  /* An optional line under the act — a tagline or home city. Omit it and the
     card closes up as before. */
  note?: string;
  /* Solo portraits fill the card. A group shot is far wider than the card is,
     so cropping it to fill would lose most of the band — those set "contain"
     and sit as a full-width strip across the top instead. */
  fit?: "cover" | "contain";
  /* Where the face sits across the width of the source frame, for shots the
     card has to crop the sides off. Omit it on anything roughly centred. */
  focusX?: string;
};

export const EVENTS: Event[] = [
  {
    artist: "Quills",
    date: "4th Sept",
    photo: "/lineup/quills.jpg",
    /* He stands left of centre in a wide frame. */
    focusX: "40%",
    ticket: "",
  },
  {
    artist: "Kinky Sound",
    date: "5th Sept",
    photo: "/lineup/kinky-sounds.jpg",
    /* A square frame with him standing well right of centre. */
    focusX: "60%",
    ticket: "",
  },
  {
    artist: "Aalika",
    date: "11th Sept",
    photo: "/lineup/aalika.jpg",
    ticket: "",
  },
  {
    artist: "Karwaan (Live)",
    note: "The Instagram sensation · Lucknow",
    fit: "contain",
    date: "12th Sept",
    photo: "/lineup/karwaan.jpg",
    ticket: "",
  },
  {
    artist: "Akbar Sami",
    date: "12th Sept",
    photo: "/lineup/akbar-sami.jpg",
    ticket: "",
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function EventCard({ event, index }: { event: Event; index: number }) {
  const ref = useRef<HTMLElement>(null);
  // Anything without an observer just shows the card outright.
  const [shown, setShown] = useState(() => !("IntersectionObserver" in window));
  const [noPhoto, setNoPhoto] = useState(false);

  // Cards arrive as they come into view rather than all at once on load, so
  // the stagger reads as the row dealing itself out under the scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Pointer tilt. Written to CSS custom properties on the node instead of
  // React state — this fires on every mouse move and a re-render per frame
  // would cost far more than the effect is worth.
  function tilt(e: React.PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const box = el.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    el.style.setProperty("--ry", `${x * 14}deg`);
    el.style.setProperty("--rx", `${-y * 14}deg`);
    el.style.setProperty("--px", `${(x + 0.5) * 100}%`);
    el.style.setProperty("--py", `${(y + 0.5) * 100}%`);
  }

  function untilt() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  }

  return (
    <article
      ref={ref}
      className={`card${shown ? " cardIn" : ""}`}
      style={{ "--i": index } as React.CSSProperties}
      onPointerMove={tilt}
      onPointerLeave={untilt}
    >
      <div className="cardInner">
        <div
          className={`portrait${event.fit === "contain" ? " portraitFit" : ""}`}
          style={event.focusX ? ({ "--fx": event.focusX } as React.CSSProperties) : undefined}
        >
          {!noPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.photo}
              alt={event.artist}
              loading="lazy"
              onError={() => setNoPhoto(true)}
            />
          ) : (
            <span className="initials" aria-hidden>
              {initials(event.artist)}
            </span>
          )}
          <span className="smoke" aria-hidden />
        </div>

        <div className="cardCopy">
          <h3 className="evtTitle">{event.artist}</h3>
          {event.note && <p className="evtNote">{event.note}</p>}

          <div className="rule" aria-hidden>
            <span className="star">✦</span>
          </div>

          <p className="evtDate">{event.date}</p>

          {event.ticket ? (
            <a className="ticket" href={event.ticket} target="_blank" rel="noopener noreferrer">
              Get Tickets
            </a>
          ) : (
            <span className="ticket ticketSoon" aria-disabled="true">
              Tickets Soon
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Lineup() {
  const headRef = useRef<HTMLDivElement>(null);
  const [headIn, setHeadIn] = useState(() => !("IntersectionObserver" in window));

  useEffect(() => {
    const el = headRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHeadIn(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="lineup" id="lineup" aria-label="NYX turns ten — the lineup">
      {/* A runway taller than the screen with the title stuck to the top of it,
          so the wordmark lands as the X finishes opening and then holds for a
          beat before the nights come up under it. */}
      <div className="headStage">
        <div className={`lineupHead${headIn ? " headIn" : ""}`} ref={headRef}>
          {/* The mark carries the venue name itself, so it stands in for the
              line of type that used to sit here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="venueMark" src="/nyx-logo.png" alt="NYX Lounge & Deck" width={600} height={401} />
          <h2 className="turns">
            <span className="turnsWord">Turns</span>
            <span className="turnsX" aria-hidden>
              X
            </span>
            <span className="srOnly">ten</span>
          </h2>
          <p className="ten" aria-hidden>
            Ten
          </p>
          <DateRange className="datesLineup" />
        </div>
      </div>

      {/* A standing band, not a ticker: one line, centred, holding still. */}
      <div className="marquee" aria-hidden>
        <span className="marqueeLine">
          <i>✦</i> Guwahati’s wildest celebration <i>✦</i>
        </span>
      </div>

      {/* The column count follows the data, so adding a night does not
          leave an orphan on the end of the row. */}
      <div className="cards" style={{ "--cols": EVENTS.length } as React.CSSProperties}>
        <span className="cardsBeamClip" aria-hidden>
          <span className="cardsBeam" />
        </span>
        {EVENTS.map((event, i) => (
          <EventCard key={`${event.artist}-${event.date}`} event={event} index={i} />
        ))}
      </div>

      <p className="lineupFoot">Five nights · One decade · Sep 4–13, 2026</p>
    </section>
  );
}
