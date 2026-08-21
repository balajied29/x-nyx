"use client";

import dynamic from "next/dynamic";
import {
  Fragment,
  FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const Scene = dynamic(() => import("@/components/Scene"), { ssr: false });
/**
 * Client-only: the cards read IntersectionObserver as they initialise, so
 * there is nothing sensible for the server to render.
 *
 * The placeholder is not decoration. Everything below the reveal mounts at
 * once, and until this chunk arrives the booking section would sit directly
 * under the hero spacer — on screen, for exactly as long as the load takes,
 * before the lineup lands and shoves it down. Holding a screen's worth of
 * height keeps it below the fold either way. loadLineup() then warms the
 * chunk during the teaser, so in practice the placeholder is never seen.
 */
const loadLineup = () => import("@/components/Lineup");
const Lineup = dynamic(loadLineup, {
  ssr: false,
  loading: () => <div style={{ height: "100dvh" }} aria-hidden />,
});

/**
 * The moment, as one instant rather than a wall-clock reading.
 *
 * Built from date parts this was 10:10 PM in whatever timezone the visitor's
 * browser happened to be in, so the reveal was not a shared moment at all —
 * someone watching from London would have got it five and a half hours after
 * the room did. The offset is written into the string, so this is a fixed
 * point on the timeline and everyone arrives at it together.
 */
const TARGET = new Date("2026-08-21T21:44:00+05:30"); // brought forward on the night
const MIN_LOADER_MS = 1400;
/**
 * Where the table-booking button sends people — a WhatsApp link, a phone
 * number, or a reservations page. Leave it empty and the button says
 * "Bookings soon" instead of pointing nowhere.
 */
const BOOKING_URL = "";
/**
 * The reservations desk. Two lines are published because two phones ring —
 * offering both beats making anyone guess which one picks up. Written the way
 * they are read; the tel: href is derived, so there is one place to edit.
 */
const RESERVATIONS = ["95085 55550", "95085 55558"];
const DIAL_CODE = "+91";
// The reveal: the countdown blows out, the screen whites over, and the copy
// underneath has changed by the time the flash clears.
const FLASH_SWAP_MS = 900;
const FLASH_TOTAL_MS = 1700;
const VISITOR_KEY = "xnyx_visitor_no";
const REGISTERED_KEY = "xnyx_registered";

/**
 * The three client-only facts on this page — the clock, the registration flag
 * and the visitor number — are all things React cannot read while rendering,
 * and all reach it the same way. This is just that call, named once.
 */
type Store<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
};

function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/**
 * ?preview=… drives the states that are otherwise gated on the clock:
 * "reveal" replays the moment a couple of seconds in, "revealed" shows the
 * aftermath, "registered" shows the list state. Read in a few places, so it
 * lives in one.
 */
function previewFlag() {
  return new URLSearchParams(window.location.search).get("preview");
}

type Remaining = { days: string; hours: string; mins: string; secs: string };

function remainingParts(): Remaining {
  const ms = Math.max(0, TARGET.getTime() - Date.now());
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    days: pad(Math.floor(s / 86400)),
    hours: pad(Math.floor((s % 86400) / 3600)),
    mins: pad(Math.floor((s % 3600) / 60)),
    secs: pad(s % 60),
  };
}

/**
 * The clock, as something to subscribe to rather than something to poll into
 * state. Reading it while rendering would have the server and the browser
 * disagree at hydration, which is why the first value arrives after mount.
 *
 * The snapshot is cached between ticks on purpose: React compares snapshots by
 * identity, so handing back a fresh object on every read would re-render
 * forever. One interval serves every listener and stops with the last of them.
 */
const clock = (() => {
  let snapshot: Remaining | null = null;
  const listeners = new Set<() => void>();
  let id: ReturnType<typeof setInterval> | undefined;

  const tick = () => {
    snapshot = remainingParts();
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (id === undefined) {
        // Fresh before React re-reads it, but without calling the listener
        // back inside subscribe.
        snapshot = remainingParts();
        id = setInterval(tick, 1000);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearInterval(id);
          id = undefined;
        }
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => null,
  };
})();

/**
 * The reveal sound.
 *
 * It leads the flash rather than landing on it: the file opens with a riser
 * that has to be underway before the white hits, so playback starts this far
 * ahead and the impact lands on the frame.
 */
const REVEAL_SOUND_LEAD_MS = 2400;

/**
 * Autoplay stays blocked until the visitor has interacted with the page, so
 * the element is primed on their first gesture — played muted and immediately
 * paused, which is what actually unlocks it for later. Someone who only ever
 * watches the clock unlocks nothing and the moment passes in silence, which is
 * the correct outcome: a blocked play() rejects and there is nothing to
 * recover, and a page has no business insisting on being heard.
 */
const revealSound = (() => {
  let el: HTMLAudioElement | null = null;
  const element = () => {
    if (!el) {
      el = new Audio("/reveal.mp3");
      el.preload = "auto";
    }
    return el;
  };
  return {
    prime() {
      const a = element();
      a.muted = true;
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        })
        .catch(() => {
          a.muted = false;
        });
    },
    play() {
      const a = element();
      a.currentTime = 0;
      a.play().catch(() => {});
    },
  };
})();

/**
 * Whether the moment had already passed when the page opened — the clock and
 * the URL, neither of which React can read while rendering.
 *
 * ?preview=reveal answers false however late it is, so the moment can still be
 * replayed for the venue on a night that is already past. Anyone else arriving
 * after it gets the aftermath directly; the flash belongs to the people who
 * were watching the clock.
 */
function momentAlreadyPassed() {
  const preview = previewFlag();
  if (preview === "reveal") return false;
  return preview === "revealed" || Date.now() >= TARGET.getTime();
}

/* Cached, because React compares snapshots between renders and this one must
   not flip under it as the clock crosses the target. It is a fact about when
   the page opened, so reading it once is also the honest thing to do. */
const arrival = (() => {
  let snapshot: boolean | undefined;
  return {
    subscribe: () => () => {},
    getSnapshot: () => (snapshot ??= momentAlreadyPassed()),
    getServerSnapshot: () => false,
  };
})();

/**
 * This browser's visitor number: claimed from the server once, then kept, so
 * the same person always sees the same number. The claim is a one-off side
 * effect on an external counter, so the store owns it and the component only
 * reads the result.
 */
const visitorNumber = (() => {
  const listeners = new Set<() => void>();
  let snapshot: string | null = null;
  let claimed = false;

  const claim = () => {
    if (claimed) return;
    claimed = true;
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored) {
      // Synchronous, so React picks it up on the read straight after subscribe
      // and the line never flashes empty for a returning visitor.
      snapshot = stored;
      return;
    }
    fetch("/api/visit", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.number !== "number") return;
        snapshot = String(data.number);
        localStorage.setItem(VISITOR_KEY, snapshot);
        for (const listener of listeners) listener();
      })
      .catch(() => {
        /* counter unreachable — the line just stays hidden */
      });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      claim();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => null,
  };
})();

/**
 * Whether this browser has already registered. localStorage is not something
 * React can read while rendering — on the server there is no answer at all —
 * so it arrives the same way the clock does. The `storage` event only fires in
 * *other* tabs, so a write made here announces itself through done().
 */
const registration = (() => {
  const listeners = new Set<() => void>();
  let snapshot = false;

  const read = () =>
    previewFlag() === "registered" || localStorage.getItem(REGISTERED_KEY) === "1";

  const sync = () => {
    const next = read();
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        snapshot = read();
        window.addEventListener("storage", sync);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", sync);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => false,
    /* The one place the flag is written, so the form does not have to know the
       key or remember to announce the change. */
    done() {
      localStorage.setItem(REGISTERED_KEY, "1");
      sync();
    },
  };
})();

function Countdown({ blowing }: { blowing: boolean }) {
  const parts = useStore(clock);

  const units: [keyof Remaining, string][] = [
    ["days", "Days"],
    ["hours", "Hrs"],
    ["mins", "Min"],
    ["secs", "Sec"],
  ];
  return (
    <>
      <span className="srOnly">Arrives on 21 August at 10:10 PM India time</span>
      <div className={`count${blowing ? " countBlow" : ""}`} aria-hidden>
        {units.map(([key, label], i) => (
          <div className="unitWrap" key={key}>
            {i > 0 && <span className="colon">:</span>}
            <div className="unit">
              <span className="num">{parts ? parts[key] : "--"}</span>
              <span className="lbl">{label}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RegisterForm({
  open,
  onOpen,
  onDone,
}: {
  open: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button type="button" className="cta" onClick={onOpen}>
        Register
      </button>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong — try again");
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again");
      setBusy(false);
    }
  }

  return (
    <form className="regForm reveal" onSubmit={submit} noValidate={false}>
      <label className="srOnly" htmlFor="reg-name">
        Name
      </label>
      <input id="reg-name" ref={nameRef} name="name" placeholder="Name" required autoComplete="name" />
      <label className="srOnly" htmlFor="reg-email">
        Email
      </label>
      <input id="reg-email" name="email" type="email" placeholder="Email" required autoComplete="email" />
      <label className="srOnly" htmlFor="reg-phone">
        Phone
      </label>
      <input id="reg-phone" name="phone" type="tel" placeholder="Phone" required autoComplete="tel" />
      <button type="submit" disabled={busy}>
        {busy ? "Registering…" : "Confirm"}
      </button>
      {error && (
        <p className="formError" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export default function Home() {
  const [sceneReady, setSceneReady] = useState(false);
  const [minTimeUp, setMinTimeUp] = useState(false);
  const registered = useStore(registration);
  const visitor = useStore(visitorNumber);
  const [formOpen, setFormOpen] = useState(false);
  const [gone, setGone] = useState(false);
  // Two independent ways to arrive at the reveal: it had already happened when
  // the page opened, or it happened while the page was watching.
  const arrivedAfter = useStore(arrival);
  const [fired, setFired] = useState(false);
  const revealed = arrivedAfter || fired;
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    const unlock = () => revealSound.prime();
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    // Fetched while the countdown is still running, so the reveal has nothing
    // left to wait for. Failure is not worth handling: the dynamic import runs
    // again on render, and the placeholder above covers the gap.
    void loadLineup().catch(() => {});
    const id = setTimeout(() => setMinTimeUp(true), MIN_LOADER_MS);
    return () => clearTimeout(id);
  }, []);

  const loaded = sceneReady && minTimeUp;

  // Fires once, either when the clock runs out with the page open or when the
  // preview flag asks for it. Everything downstream keys off `revealed`.
  // Deliberately not keyed on `revealed`: the sequence sets it half way
  // through, and re-running on that would tear down its own remaining timers.
  useEffect(() => {
    // Already past it, or asked for the aftermath — there is no moment to play.
    if (momentAlreadyPassed()) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const fire = () => {
      setFlashing(true);
      // The copy swaps under the white, not in front of it.
      timers.push(setTimeout(() => setFired(true), FLASH_SWAP_MS));
      timers.push(setTimeout(() => setFlashing(false), FLASH_TOTAL_MS));
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        timers.push(
          setTimeout(() => {
            document.getElementById("lineup")?.scrollIntoView({ behavior: "smooth" });
          }, FLASH_TOTAL_MS + 700),
        );
      }
    };

    if (previewFlag() === "reveal") {
      timers.push(setTimeout(() => revealSound.play(), Math.max(0, 2600 - REVEAL_SOUND_LEAD_MS)));
      timers.push(setTimeout(fire, 2600));
      return () => timers.forEach(clearTimeout);
    }

    // Polled at 100ms rather than 500ms: the sound has to start on a mark, and
    // half a second of slop is audible against a two-and-a-half second riser.
    let cued = false;
    const id = setInterval(() => {
      const left = TARGET.getTime() - Date.now();
      if (!cued && left <= REVEAL_SOUND_LEAD_MS) {
        cued = true;
        revealSound.play();
      }
      if (left > 0) return;
      clearInterval(id);
      fire();
    }, 100);
    return () => {
      clearInterval(id);
      timers.forEach(clearTimeout);
    };
  }, []);

  // The teaser copy is fixed over the whole page, so it has to hand the screen
  // to the lineup as the first section leaves. Written straight to a custom
  // property rather than through state: this runs on every scroll frame and a
  // re-render per frame would cost far more than the fade is worth. It goes on
  // the root so the copy and the scroll cue — which are siblings — both read it.
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const fade = Math.min(1, window.scrollY / (window.innerHeight * 0.55));
      document.documentElement.style.setProperty("--heroFade", String(fade));
      setGone(fade > 0.9);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Nothing scrolls behind the loader, or the first thing a visitor does is
  // scroll past a teaser they have not seen yet.
  useEffect(() => {
    document.body.classList.toggle("locked", !loaded || !revealed);
  }, [loaded, revealed]);

  // Long enough for the intro fade to finish before the scroll takes over.
  const [uiLive, setUiLive] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => setUiLive(true), 1050);
    return () => clearTimeout(id);
  }, [loaded]);

  return (
    <main>
      {/* The open form makes the copy block much taller, so the X has to give
          up room for it — otherwise the two collide on a phone. */}
      <Scene onReady={() => setSceneReady(true)} compact={formOpen} solo={revealed} />
      <div className="rays" aria-hidden />
      <div className="vignette" aria-hidden />
      <div className="scrim" aria-hidden />

      <div
        className={`ui${loaded ? " uiIn" : ""}${formOpen ? " uiCompact" : ""}${
          revealed ? " uiSolo" : ""
        }${uiLive ? " uiLive" : ""}${gone ? " uiGone" : ""}`}
      >
        <p className="visitor">
          {visitor ? (
            <>
              You are Visitor <b>#{visitor.padStart(4, "0")}</b>
            </>
          ) : (
            <>&nbsp;</>
          )}
        </p>

        {revealed ? (
          // The line and nothing else: the sculpture above it is the X, and
          // everything the run needs to say is said on the lineup card.
          <div className="lower reveal">
            <h1 className="headline headlineBig">
              <span className="srOnly">X </span>is here
            </h1>
            {/* The lineup is a full screen below the fold and nothing else on
                this view says so. Also a real link, so a tap works as well as
                the gesture it names. */}
            <a className="cue" href="#lineup">
              <span className="cueSwipe">Swipe up</span>
              <span className="cueScroll">Scroll</span>
            </a>
          </div>
        ) : !registered ? (
          <div className="lower">
            <h1 className="headline">
              <span className="srOnly">X </span>is getting closer
            </h1>
            <p className="sub">Something big is on its way</p>
            <Countdown blowing={flashing} />
            <p className="warn">Register before the city finds out</p>
            <RegisterForm
              open={formOpen}
              onOpen={() => setFormOpen(true)}
              onDone={registration.done}
            />
          </div>
        ) : (
          <div className="lower reveal">
            <h1 className="headline">You&rsquo;re on the list</h1>
            <p className="sub">The next chapter arrives on 21 August</p>
            <Countdown blowing={flashing} />
            <p className="warn">Stay curious</p>
          </div>
        )}
      </div>

      {revealed && (
        <>
          <div className="heroSpacer" aria-hidden />
          <Lineup />
          <section className="signup" id="book">
            <h2 className="signupTitle">Book your table</h2>
            {/* The online desk, once there is one to link to. The phones below
                stand on their own until then — no "Bookings soon" chip, because
                a table can be booked today, just not on the web. */}
            {BOOKING_URL && (
              <a className="cta" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Book a table
              </a>
            )}

            <div className="reserve">
              <p className="reserveLabel">Table reservations</p>
              <p className="reserveNums">
                {RESERVATIONS.map((number, i) => (
                  <Fragment key={number}>
                    {i > 0 && <span className="reserveOr">or</span>}
                    <a
                      className="reserveNum"
                      href={`tel:${DIAL_CODE}${number.replace(/\s+/g, "")}`}
                    >
                      {number}
                    </a>
                  </Fragment>
                ))}
              </p>
            </div>
          </section>
        </>
      )}

      {flashing && <div className="flash" aria-hidden />}

      <div className={`loader${loaded ? " done" : ""}`} aria-hidden={loaded}>
        <span>
          [ LOADING<span className="dots" /> ]
        </span>
      </div>
    </main>
  );
}
