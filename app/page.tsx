"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useRef, useState } from "react";

const Scene = dynamic(() => import("@/components/Scene"), { ssr: false });

const TARGET = new Date(2026, 7, 20, 22, 10, 0); // 20 August 2026, 10:10 PM local time
const MIN_LOADER_MS = 1400;
const VISITOR_KEY = "xnyx_visitor_no";

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

function Countdown() {
  const [parts, setParts] = useState<Remaining | null>(null);
  useEffect(() => {
    setParts(remainingParts());
    const id = setInterval(() => setParts(remainingParts()), 1000);
    return () => clearInterval(id);
  }, []);

  const units: [keyof Remaining, string][] = [
    ["days", "Days"],
    ["hours", "Hrs"],
    ["mins", "Min"],
    ["secs", "Sec"],
  ];
  return (
    <>
      <span className="srOnly">Arrives on 20 August at 10:10 PM</span>
      <div className="count" aria-hidden>
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
      localStorage.setItem("xnyx_registered", "1");
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
  const [registered, setRegistered] = useState(false);
  const [visitor, setVisitor] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("preview") === "registered";
    setRegistered(preview || localStorage.getItem("xnyx_registered") === "1");

    // A real, sequential visitor number: claimed from the server once per
    // browser, then kept so the same visitor always sees the same number.
    const stored = localStorage.getItem(VISITOR_KEY);
    if (stored) {
      setVisitor(stored);
    } else {
      fetch("/api/visit", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (typeof data?.number !== "number") return;
          const n = String(data.number);
          localStorage.setItem(VISITOR_KEY, n);
          setVisitor(n);
        })
        .catch(() => {
          /* counter unreachable — the line just stays hidden */
        });
    }

    const id = setTimeout(() => setMinTimeUp(true), MIN_LOADER_MS);
    return () => clearTimeout(id);
  }, []);

  const loaded = sceneReady && minTimeUp;

  return (
    <main>
      {/* The open form makes the copy block much taller, so the X has to give
          up room for it — otherwise the two collide on a phone. */}
      <Scene onReady={() => setSceneReady(true)} compact={formOpen} />
      <div className="rays" aria-hidden />
      <div className="vignette" aria-hidden />
      <div className="scrim" aria-hidden />

      <div className={`ui${loaded ? " uiIn" : ""}${formOpen ? " uiCompact" : ""}`}>
        <p className="visitor">
          {visitor ? (
            <>
              You are Visitor <b>#{visitor.padStart(4, "0")}</b>
            </>
          ) : (
            <>&nbsp;</>
          )}
        </p>

        {!registered ? (
          <div className="lower">
            <h1 className="headline">
              <span className="srOnly">X </span>is getting closer
            </h1>
            <p className="sub">Something big is on its way</p>
            <Countdown />
            <p className="warn">Register before the city finds out</p>
            <RegisterForm
              open={formOpen}
              onOpen={() => setFormOpen(true)}
              onDone={() => setRegistered(true)}
            />
          </div>
        ) : (
          <div className="lower reveal">
            <h1 className="headline">You&rsquo;re on the list</h1>
            <p className="sub">The next chapter arrives on 20 August</p>
            <Countdown />
            <p className="warn">Stay curious</p>
          </div>
        )}
      </div>

      <div className={`loader${loaded ? " done" : ""}`} aria-hidden={loaded}>
        <span>
          [ LOADING<span className="dots" /> ]
        </span>
      </div>
    </main>
  );
}
