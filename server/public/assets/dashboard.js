const $ = (id) => document.getElementById(id);

const state = {
  q: "",
  page: 1,
  limit: 25,
  sort: "createdAt",
  dir: "desc",
  pages: 1,
  total: 0,
};

const numberFmt = new Intl.NumberFormat("en-IN");

/* ---------------- data ---------------- */

async function get(path) {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (res.status === 401) {
    location.href = "/dashboard/login";
    throw new Error("signed out");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

function listUrl() {
  const params = new URLSearchParams({
    q: state.q,
    page: String(state.page),
    limit: String(state.limit),
    sort: state.sort,
    dir: state.dir,
  });
  return `/api/admin/registrations?${params}`;
}

async function refresh({ silent = false } = {}) {
  const live = $("live");
  if (!silent) live.classList.add("busy");
  try {
    const [stats, list] = await Promise.all([get("/api/admin/stats"), get(listUrl())]);
    renderStats(stats);
    drawChart(stats.days);
    renderTable(list);
  } catch (err) {
    if (err.message !== "signed out") showTableMessage(err.message);
  } finally {
    live.classList.remove("busy");
  }
}

/* ---------------- summary tiles ---------------- */

function renderStats(s) {
  $("statTotal").textContent = numberFmt.format(s.total);
  $("statToday").textContent = numberFmt.format(s.today);
  $("stat7").textContent = numberFmt.format(s.last7);
  $("statTotalNote").textContent = s.total === 0 ? "no signups yet" : "all time";
  $("statTz").textContent = s.timezone.replace("_", " ");
  $("stat7Note").textContent = `avg ${(s.last7 / 7).toFixed(1)} / day`;
  $("statLatest").textContent = s.latestAt ? relativeTime(new Date(s.latestAt)) : "—";
  $("statLatestName").textContent = s.latestName ?? " ";
}

/* ---------------- chart ---------------- */

const SVG_NS = "http://www.w3.org/2000/svg";
let lastDays = [];

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/** Bar anchored to the baseline with rounded top corners only. */
function barPath(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function drawChart(days) {
  lastDays = days;
  const svg = $("chart");
  svg.replaceChildren();

  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 190;
  const pad = { top: 12, right: 4, bottom: 20, left: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const peak = Math.max(1, ...days.map((d) => d.count));
  const yMax = peak <= 4 ? 4 : Math.ceil(peak / 4) * 4;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;

  // Recessive gridlines + y labels at 0, half, max.
  const grid = el("g", { class: "grid" });
  const axis = el("g", { class: "axis" });
  for (const v of [0, yMax / 2, yMax]) {
    grid.append(el("line", { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v) }));
    const label = el("text", { x: pad.left - 8, y: y(v) + 3, "text-anchor": "end" });
    label.textContent = String(v);
    axis.append(label);
  }
  svg.append(grid);

  const slot = plotW / days.length;
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const todayKey = days.at(-1)?.date;

  days.forEach((day, i) => {
    const x = pad.left + i * slot + (slot - barW) / 2;
    const col = el("g", { class: "col" });

    if (day.count > 0) {
      const h = Math.max(2, plotH - (y(day.count) - pad.top));
      col.append(el("path", { class: `bar${day.date === todayKey ? " today" : ""}`, d: barPath(x, y(day.count), barW, h, 4) }));
    } else {
      col.append(el("rect", { class: "bar", x, y: pad.top + plotH - 1, width: barW, height: 1, opacity: 0.25 }));
    }

    const hit = el("rect", { class: "hit", x: pad.left + i * slot, y: pad.top, width: slot, height: plotH });
    hit.addEventListener("pointerenter", () => showTip(day, pad.left + i * slot + slot / 2, y(day.count), col));
    hit.addEventListener("pointerleave", () => hideTip(col));
    col.append(hit);
    svg.append(col);

    // Date labels only every 5th day, plus today — never one per bar.
    if (i % 5 === 0 || i === days.length - 1) {
      const label = el("text", { x: pad.left + i * slot + slot / 2, y: height - 6, "text-anchor": "middle" });
      label.textContent = shortDate(day.date);
      axis.append(label);
    }
  });

  svg.append(axis);
  $("chartDesc").textContent = `Daily registrations for the last ${days.length} days. Peak ${peak} on a single day.`;
}

function showTip(day, x, yTop, col) {
  const tip = $("tip");
  col.classList.add("on");
  tip.replaceChildren();
  const count = document.createElement("b");
  count.textContent = `${day.count} signup${day.count === 1 ? "" : "s"}`;
  const when = document.createElement("span");
  when.textContent = `  ${longDate(day.date)}`;
  tip.append(count, when);
  tip.hidden = false;
  // The svg fills .chartWrap's content box, so svg coords + its 18px padding = wrap coords.
  const PAD = 18;
  const wrapW = tip.parentElement.clientWidth;
  const half = tip.offsetWidth / 2;
  tip.style.left = `${Math.min(Math.max(x + PAD, half + 4), wrapW - half - 4)}px`;
  tip.style.top = `${Math.max(yTop, 24) + PAD - 8}px`;
}

function hideTip(col) {
  col.classList.remove("on");
  $("tip").hidden = true;
}

/* ---------------- table ---------------- */

function showTableMessage(text) {
  const row = document.createElement("tr");
  row.className = "empty";
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.textContent = text;
  row.append(cell);
  $("rows").replaceChildren(row);
}

function renderTable(list) {
  state.pages = list.pages;
  state.total = list.total;

  if (!list.items.length) {
    showTableMessage(state.q ? `No one matches “${state.q}”.` : "No signups yet.");
  } else {
    const offset = (list.page - 1) * list.limit;
    const rows = list.items.map((item, i) => {
      const tr = document.createElement("tr");

      const num = document.createElement("td");
      num.className = "num";
      num.textContent = String(
        state.sort === "createdAt" && state.dir === "desc" ? list.total - offset - i : offset + i + 1,
      );

      const name = document.createElement("td");
      name.textContent = item.name;

      const email = document.createElement("td");
      email.append(copyable(item.email));

      const phone = document.createElement("td");
      phone.append(copyable(item.phone));

      const when = document.createElement("td");
      when.className = "when";
      when.title = new Date(item.createdAt).toString();
      when.textContent = `${stamp(item.createdAt)}  ·  ${relativeTime(new Date(item.createdAt))}`;

      const actions = document.createElement("td");
      actions.className = "rowActions";
      const del = document.createElement("button");
      del.className = "iconBtn";
      del.type = "button";
      del.title = `Remove ${item.email}`;
      del.setAttribute("aria-label", `Remove ${item.email}`);
      del.textContent = "✕";
      del.addEventListener("click", () => removeRow(item));
      actions.append(del);

      tr.append(num, name, email, phone, when, actions);
      return tr;
    });
    $("rows").replaceChildren(...rows);
  }

  const from = list.total === 0 ? 0 : (list.page - 1) * list.limit + 1;
  const to = Math.min(list.page * list.limit, list.total);
  $("pageInfo").textContent = `${from}–${to} of ${numberFmt.format(list.total)}${state.q ? " matching" : ""}`;
  $("prev").disabled = list.page <= 1;
  $("next").disabled = list.page >= list.pages;
}

function copyable(text) {
  const span = document.createElement("span");
  span.className = "copy";
  span.tabIndex = 0;
  span.title = "Click to copy";
  span.textContent = text;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      const original = span.textContent;
      span.classList.add("copied");
      span.textContent = "copied";
      setTimeout(() => {
        span.textContent = original;
        span.classList.remove("copied");
      }, 900);
    } catch {
      /* clipboard blocked — leave the text as-is */
    }
  };
  span.addEventListener("click", copy);
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      copy();
    }
  });
  return span;
}

async function removeRow(item) {
  if (!confirm(`Remove ${item.name} (${item.email})? This deletes the signup permanently.`)) return;
  const res = await fetch(`/api/admin/registrations/${item.id}`, { method: "DELETE" });
  if (res.ok) refresh({ silent: true });
}

/* ---------------- formatting ---------------- */

function stamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function relativeTime(date) {
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 172800) return "yesterday";
  return `${Math.floor(secs / 86400)}d ago`;
}

function shortDate(key) {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

function longDate(key) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/* ---------------- wiring ---------------- */

let searchTimer;
$("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = e.target.value.trim();
    state.page = 1;
    $("exportCsv").href = `/api/admin/registrations.csv${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}`;
    refresh({ silent: true });
  }, 250);
});

$("prev").addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    refresh({ silent: true });
  }
});

$("next").addEventListener("click", () => {
  if (state.page < state.pages) {
    state.page += 1;
    refresh({ silent: true });
  }
});

document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const field = th.dataset.sort;
    if (state.sort === field) {
      state.dir = state.dir === "asc" ? "desc" : "asc";
    } else {
      state.sort = field;
      state.dir = field === "createdAt" ? "desc" : "asc";
    }
    state.page = 1;
    document.querySelectorAll("th.sortable .caret").forEach((c) => c.remove());
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.textContent = state.dir === "asc" ? " ↑" : " ↓";
    th.append(caret);
    refresh({ silent: true });
  });
});

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => lastDays.length && drawChart(lastDays), 150);
});

setInterval(() => {
  if (!document.hidden) refresh({ silent: true });
}, 30000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refresh({ silent: true });
});

refresh();
