"use strict";
// EWR guide: an animated walkthrough of what one EWR asks for. Ported from src/ewr_guide.js in aracingcar/ewr-analysis-dashboard.
// Part 1 is plain logic with no DOM; part 2 draws the steps and runs the player. The flow record it shows is illustrative,
// generated from the EWR's own parameters, not gauge data. Needs esc() from ewr-core.js.

// ---- part 1: the rule, an illustrative record --------------------------------------------------------------------------------------
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WY_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];   // the EWR year runs July to June
const MONTH_LEN = { 1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };
const WY_DAYS = 365;

/** Day of the July-June year (0 = 1 July) of a calendar month and day. */
function wyDay(month, day) {
  let d = 0;
  for (const m of WY_MONTHS) { if (m === month) break; d += MONTH_LEN[m]; }
  return d + Math.min(day, MONTH_LEN[month]) - 1;
}

/** A guide row from parameter-sheet values. get(column) gives the cell ("" or null when blank); h is py_ewr's handler; k overrides FlowLevelVolume (S for salinity). */
function guideRow(get, h, k) {
  const s = c => String(get(c) ?? "").trim();
  const n = c => { const v = s(c); if (v === "") return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
  // StartMonth / EndMonth are text such as "9.15" = 15 September; no day means the whole month.
  const [sm, sd] = (s("StartMonth") || "7").split("."), [em, ed] = (s("EndMonth") || "6").split(".");
  return {
    c: s("Code"), g: s("Gauge"), gn: s("CompliancePoint/Node"), pu: s("PlanningUnitName"), st: s("State"), k: k || s("FlowLevelVolume"), eo: s("EcoObj"), mg: s("Multigauge"), h,
    sm: +sm || 7, sd: +sd || 1, em: +em || 6, ed: +ed || null, tf: n("TargetFrequency"), tfl: n("TargetFrequencyMin"), tfh: n("TargetFrequencyMax"), epy: n("EventsPerYear"),
    dur: n("Duration"), ms: n("MinSpell"), tmin: n("FlowThresholdMin"), tmax: n("FlowThresholdMax"), mi: n("MaxInter-event"), gap: n("WithinEventGapTolerance"),
    lmin: n("LevelThresholdMin"), lmax: n("LevelThresholdMax"), vol: n("VolumeThreshold"), acc: n("AccumulationPeriod"),
  };
}

const REGIMES = [[/^CF/, "Cease to flow"], [/^BF/, "Base flow"], [/^LF|^W-LF/, "Low flow"], [/^SF/, "Small fresh"], [/^OB/, "Overbank"], [/^BK/, "Bankfull"]];
/** Return the flow regime label for a recognised EWR code prefix, or an empty string. */
const regimeName = code => (REGIMES.find(([re]) => re.test(code)) || [0, ""])[1];

/** The walkthrough covers the EWRs py_ewr evaluates with flow_handle or lowflow_handle (its calc config); the rest get a description only. */
const ewrSupported = r => r.h === "flow_handle" || r.h === "lowflow_handle";

/** What each of py_ewr's handlers checks, in plain words, keyed by kind then handler (as HANDLERS in ewr-core.js). */
const RULE_TEXT = {
  flow_handle: "Counts unbroken spells inside the window when flow stays within the limits. A year passes when it has enough spells, each at least the required length.",
  lowflow_handle: "Counts the total days inside the window when flow is within the limits. The days need not be in a row.",
  ctf_handle: "Looks for cease-to-flow spells: runs of days when flow is at or below the upper limit (the river has all but stopped).",
  flow_handle_anytime: "An unbroken flow spell that may run on past 30 June into the next year; the whole July–June year counts.",
  flow_handle_check_ctf: "An unbroken flow spell that only counts when it follows a dry (cease-to-flow) spell of at least the set length.",
  rise_and_fall_handle: "Checks how quickly flow rises or falls from day to day, against the set rates.",
  cumulative_handle: "Adds up the flow over a moving accumulation period. A year passes when that total reaches the volume inside the window.",
  level_handle: "Water level must stay within the limits for the required days, without falling faster than the drawdown rate.",
};
/** Plain-words description of what a row's handler checks, or "" for a handler not described. */
function ruleSummary(r) {
  const base = r.h && r.h.replace(/_multi$/, ""), multi = !!r.h && r.h !== base;
  let t = RULE_TEXT[base] || "";
  if (base === "rise_and_fall_handle" && r.k === "L") t = "Checks how quickly the water level rises or falls from day to day, against the set rates.";
  if (t && r.k === "S") t = t.replace(/\bflow\b/g, "salinity");
  return t && multi ? t + " Flows at the two gauges are combined first." : t;
}

const NO_MAX = 1e6;   // the sheet's FlowThresholdMax for "no upper limit"
/** The EWR as a drawable rule. mode: flow (stay in [lo, hi]), dry (flow at or below hi), level, volume, or other (not drawn). */
function ewrSpec(r) {
  const pos = v => (v != null && Number.isFinite(v) ? v : null);
  const sm = r.sm, em = r.em, sd = r.sd || 1, ed = r.ed || MONTH_LEN[em];
  const s = wyDay(sm, sd), e = wyDay(em, ed);
  const segs = s <= e ? [[s, e]] : [[s, WY_DAYS - 1], [0, e]];
  const maxLen = segs.reduce((m, [a, b]) => Math.max(m, b - a + 1), 0);
  const dur = Math.min(pos(r.dur) > 0 ? r.dur : 1, maxLen);   // an event cannot be longer than the window it must sit in
  const ms = Math.min(pos(r.ms) > 0 ? r.ms : dur, dur);
  const epyReq = pos(r.epy) > 0 ? r.epy : 1;
  const epy = Math.max(1, Math.min(epyReq, Math.floor((maxLen + 6) / (dur + 6))));   // how many events fit in the window
  const spec = {
    mode: "other", lo: 0, hi: null, unit: "ML/d", dur, ms, epy, epyReq, segs, maxLen, sm, sd, em, ed, tf: pos(r.tf), tfl: pos(r.tfl), tfh: pos(r.tfh),
    mi: pos(r.mi) > 0 ? pos(r.mi) : null, gap: pos(r.gap) || 0, vol: null, acc: null, whole: segs.length === 1 && segs[0][0] === 0 && segs[0][1] === WY_DAYS - 1,
  };
  if (r.k === "V") {
    if (pos(r.vol) > 0) {
      spec.mode = "volume"; spec.vol = r.vol;
      spec.acc = Math.max(1, Math.min(pos(r.acc) > 0 ? r.acc : dur, maxLen));
    }
  } else if (r.k === "L" || r.k === "LL") {
    const lo = pos(r.lmin) ?? 0, hi = pos(r.lmax);
    if (lo > 0 || (hi != null && hi > lo)) { spec.mode = "level"; spec.unit = "m"; spec.lo = lo; spec.hi = hi != null && hi > lo ? hi : null; }
  } else {
    const lo = pos(r.tmin) ?? 0, hi = pos(r.tmax) != null && r.tmax < NO_MAX ? r.tmax : null;
    if (lo > 0) { spec.mode = "flow"; spec.lo = lo; spec.hi = hi != null && hi > lo ? hi : null; }
    else if (hi != null && hi > 0) { spec.mode = "dry"; spec.lo = 0; spec.hi = hi; }
  }
  if (r.k === "S") spec.unit = "EC";
  return spec;
}

/** Test whether a water-year day falls in any inclusive EWR window segment. */
const inWindow = (spec, d) => spec.segs.some(([a, b]) => d >= a && d <= b);
/** Test whether a value lies within the inclusive threshold range. */
const inZone = (spec, v) => v >= spec.lo && (spec.hi == null || v <= spec.hi);

/** Plateau value of a qualifying event, and the baseline the flow sits at between events. */
function levels(spec) {
  const { lo, hi } = spec;
  if (spec.mode === "level") {
    const base = lo - 0.9;
    return { base, plateau: hi != null ? (lo + hi) / 2 : lo + 0.5, ymin: lo - 1.6, ymax: (hi != null ? hi : lo) + 1.4 };
  }
  if (spec.mode === "dry") {
    const base = spec.hi * 12;
    return { base, plateau: spec.hi * 0.35, ymin: 0, ymax: base * 1.4 };
  }
  if (spec.mode === "volume") {
    const q = spec.vol / spec.acc * 1.25;
    return { base: q * 0.12, plateau: q, ymin: 0, ymax: q * 1.6 };
  }
  const plateau = hi != null ? Math.min(lo * 1.6, (lo + hi) / 2) : lo * 1.6;
  const top = hi != null && hi <= lo * 20 ? hi * 1.7 : 0;
  return { base: lo * 0.5, plateau, ymin: 0, ymax: Math.max(plateau * 1.4, top, lo * 1.5) };
}

/** Create a seeded Mulberry32 generator returning repeatable values in [0, 1). */
function rng(seed) {   // mulberry32: the same record every time
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Runs of days outside the EWR window: [[start, end], ...]. */
function freeRuns(spec) {
  const runs = [];
  for (let d = 0; d < WY_DAYS; d++) {
    if (inWindow(spec, d)) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === d - 1) last[1] = d; else runs.push([d, d]);
  }
  return runs;
}
/** Return the accumulation period for volume rules or the duration for other rules. */
const eventLen = spec => (spec.mode === "volume" ? spec.acc : spec.dur);

/** Why a year misses; each needs the rule to allow it (else the next feasible one is used). */
function missFeasible(spec, type) {
  if (type === "short") return spec.mode !== "volume" && Math.min(spec.ms, spec.dur) >= 2;
  if (type === "outside") return freeRuns(spec).some(([a, b]) => b - a + 1 >= eventLen(spec) + 8);
  if (type === "over") return (spec.mode === "flow" || spec.mode === "level") && spec.hi != null && (spec.mode === "level" || spec.hi <= spec.lo * 20);
  return true;   // low
}

/** One year of daily values (length 365, day 0 = 1 July) for type met | short | low | outside | over. */
function genYear(spec, type, seed) {
  const R = rng(seed * 7919 + 17), L = levels(spec), flow = new Array(WY_DAYS);
  const wob = 0.12 + 0.05 * R(), ph = R() * 6.28, ph2 = R() * 6.28;
  for (let d = 0; d < WY_DAYS; d++) {
    const w = 1 + wob * Math.sin(d / 58 + ph) + 0.05 * Math.sin(d / 9 + ph2) + 0.02 * (R() - 0.5);
    flow[d] = spec.mode === "level" ? L.base + 0.3 * (w - 1) : L.base * w;
  }
  const bump = (c, h, wd) => { for (let d = 0; d < WY_DAYS; d++) { const k = Math.exp(-(((d - c) / wd) ** 2)); flow[d] += spec.mode === "level" ? h * k * 0.5 : spec.mode === "dry" ? h * k : L.base * h * k; } };
  const stop = spec.mode === "level" ? 0.2 : spec.mode === "dry" ? L.base * 0.3 : 0.4;
  if (type !== "outside") { bump(40 + R() * 40, stop, 6); bump(250 + R() * 60, stop * 0.8, 9); }
  const events = [];   // [start, length, value]
  const place = (a, b, len, n, value) => {   // n events of len days inside days a..b
    const room = b - a + 1, gap = 6;
    const k = Math.max(1, Math.min(n, Math.floor((room + gap) / (len + gap))));
    const slot = room / k;
    for (let i = 0; i < k; i++) {
      const l = Math.min(len, Math.floor(slot));
      events.push([Math.round(a + i * slot + Math.max(0, (slot - l) * 0.4)), l, value]);
    }
  };
  const big = spec.segs.reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m), spec.segs[0]);
  const len = Math.max(spec.dur, spec.ms);
  const bigFree = freeRuns(spec).reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m), [0, -1]);
  if (spec.mode === "volume") {
    const n = spec.acc;
    if (type === "met") place(big[0], big[1], n, 1, L.plateau);
    else if (type === "outside") place(bigFree[0] + 4, bigFree[1] - 4, Math.min(n, bigFree[1] - bigFree[0] - 7), 1, L.plateau);
    else place(big[0], big[1], n, 1, L.plateau * 0.4);
  } else if (type === "met") place(big[0], big[1], len, spec.epy, L.plateau);
  else if (type === "short") place(big[0], big[1], Math.max(1, Math.floor(Math.min(spec.ms, spec.dur) / 2)), 1, L.plateau);
  else if (type === "outside") place(bigFree[0] + 4, bigFree[1] - 4, Math.min(len, bigFree[1] - bigFree[0] - 7), 1, L.plateau);
  else if (type === "over") place(big[0], big[1], len, 1, spec.mode === "level" ? spec.hi + 0.6 : spec.hi * 1.5);
  else place(big[0], big[1], len, 1, spec.mode === "level" ? spec.lo - 0.35 : spec.mode === "dry" ? spec.hi * 2.2 : spec.lo * 0.8);   // low
  const edge = spec.mode === "dry" ? spec.hi * 1.15 : spec.mode === "level" ? spec.lo - 0.1 : spec.mode === "volume" ? 0 : spec.lo * 0.92;
  for (const [s, l, v] of events) {
    const target = type === "low" || type === "over" || spec.mode === "volume" ? v : edge;
    for (let k = 1; k <= 3 && type !== "over"; k++) {   // (no ramp for "over": it would cross the range on the way up) three-day ramps that stay outside the zone, so a qualifying event is exactly l days long
      const t = k / 4, iu = s - 4 + k, id = s + l - 1 + k;
      if (iu >= 0 && iu < WY_DAYS) flow[iu] += (target - flow[iu]) * t;
      if (id >= 0 && id < WY_DAYS) flow[id] += (target - flow[id]) * (1 - t);
    }
    for (let d = s; d < s + l && d < WY_DAYS; d++) {
      const wig = spec.mode === "level" ? 0.04 * Math.sin(d / 5) : v * 0.03 * Math.sin(d / 5);
      let val = v + wig;
      if (type === "met" || type === "short" || type === "outside") val = clampZone(spec, val);
      flow[d] = val;
    }
  }
  return flow;
}

/** Keep a generated value just inside the thresholds; leave volume values unchanged. */
function clampZone(spec, v) {
  if (spec.mode === "volume") return v;
  const proposed = spec.mode === "level" ? 0.02 : Math.max(spec.lo, spec.hi || spec.lo) * 0.01;
  const eps = spec.hi != null ? Math.min(proposed, (spec.hi - spec.lo) / 4) : proposed;
  return Math.max(spec.lo + eps, spec.hi != null ? Math.min(spec.hi - eps, v) : v);
}

/** Runs of consecutive days in the zone inside the EWR window: [[start, length], ...]. */
function zoneRuns(spec, flow) {
  const runs = [];
  let s = -1;
  for (let d = 0; d <= WY_DAYS; d++) {
    const on = d < WY_DAYS && inWindow(spec, d) && inZone(spec, flow[d]);
    if (on && s < 0) s = d;
    if (!on && s >= 0) { runs.push([s, d - s]); s = -1; }
  }
  return runs;
}

/** Does this year meet the EWR? Also returns the days counted and (volume) the best accumulated volume. */
function yearResult(spec, flow) {
  if (spec.mode === "volume") {
    let best = 0, at = 0;
    for (const [a, b] of spec.segs) {
      let sum = 0;
      for (let d = a; d <= b; d++) {
        sum += flow[d];
        if (d - a >= spec.acc) sum -= flow[d - spec.acc];
        if (d - a >= spec.acc - 1 && sum > best) { best = sum; at = d - spec.acc + 1; }
      }
    }
    return { met: best >= spec.vol, days: spec.acc, volume: best, at };
  }
  const runs = zoneRuns(spec, flow), good = runs.filter(([, l]) => l >= spec.ms);
  const days = good.reduce((n, [, l]) => n + l, 0), all = runs.reduce((n, [, l]) => n + l, 0);
  return { met: good.length >= spec.epy && days >= spec.dur * spec.epy, days, all, runs, good };
}

const RECORD_PATTERN = ["met", "met", "short", "met", "low", "outside", "met", "met", "over", "met"];   // 6 of 10 years, longest gap 3 years

/** The illustrative 10-year record plus a met example year and a missed example year, all from the EWR's own numbers. */
function buildTutorial(spec) {
  if (spec.mode === "other") return { spec, drawable: false, record: RECORD_PATTERN.map((t, i) => ({ type: t, met: t === "met", i })) };
  const make = (type, seed) => {
    let t = type;
    if (t !== "met" && !missFeasible(spec, t)) t = ["short", "low"].find(x => missFeasible(spec, x));
    const flow = genYear(spec, t, seed);
    return { type: t, flow, res: yearResult(spec, flow), met: yearResult(spec, flow).met };
  };
  const record = RECORD_PATTERN.map((t, i) => ({ ...make(t, i + 1), i }));
  const metEx = record.find(y => y.met), missEx = record.find(y => !y.met && y.type !== "outside") || record.find(y => !y.met);
  const met = record.filter(y => y.met).map(y => y.i);
  let gap = 0;
  for (let k = 1; k < met.length; k++) gap = Math.max(gap, met[k] - met[k - 1]);
  const n = met.length;
  return { spec, drawable: true, record, metEx, missEx, n, pct: n * 10, gap, L: levels(spec), fr: spec.tf ? Math.min(1, n * 10 / spec.tf) : null, frRaw: spec.tf ? n * 10 / spec.tf : null };
}

// ---- part 2: the steps and the player ----------------------------------------------------------------------------------------------
// EwrGuide.show(box, row, {autoplay, keepStep}) fills box with the walkthrough of one guide row; one walkthrough plays at a time.
const EwrGuide = (function () {
  if (typeof document === "undefined") return null;
  let C = {};
  /** Take the chart colours from the page's theme tokens, so the drawing follows light and dark mode. */
  const theme = () => {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    C = { acc: v("--blue"), ok: v("--green"), bad: v("--bad"), text: v("--ink"), mut: v("--muted"), org: v("--amber"), grid: v("--line"), card: v("--card") };
  };
  const fmt = v => (v == null ? "–" : (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2)).toLocaleString("en-AU"));
  const dm = (m, d) => `${d} ${MON3[m - 1]}`;
  const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ease = p => p * p * (3 - 2 * p);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const sub = (a, b, p) => clamp01((p - a) / (b - a));   // progress of a sub-interval
  const W = 520, H = 300, X0 = 66, X1 = 508, Y0 = 40, Y1 = 206;
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${+((o.size || 12) * 1.12).toFixed(1)}" font-weight="${o.w || 400}" fill="${o.fill || C.text}" text-anchor="${o.a || "start"}" opacity="${o.op ?? 1}">${esc(s)}</text>`;

  /** Describe the EWR window as all year or a start and end calendar date. */
  function windowText(sp) { return sp.whole ? "all year" : `${dm(sp.sm, sp.sd)} – ${dm(sp.em, sp.ed)}`; }
  /** Describe the threshold condition and units for the tutorial rule. */
  function ruleText(sp) {
    const unit = sp.unit || "ML/d", subject = unit === "EC" ? "salinity" : "flow";
    if (sp.mode === "other") return "the conditions set out in the parameter sheet";
    if (sp.mode === "volume") return `${fmt(sp.vol)} ML of flow accumulated within ${sp.acc} days`;
    if (sp.mode === "level") return sp.hi != null ? `water level between ${fmt(sp.lo)} and ${fmt(sp.hi)} m` : `water level of ${fmt(sp.lo)} m or higher`;
    if (sp.mode === "dry") return `${subject} of no more than ${fmt(sp.hi)} ${unit}`;
    return sp.hi != null ? `${subject} between ${fmt(sp.lo)} and ${fmt(sp.hi)} ${unit}` : `${subject} of at least ${fmt(sp.lo)} ${unit}`;
  }
  /** Describe duration, event count, minimum spell, and allowed gaps for non-volume rules. */
  function durText(sp) {
    if (sp.mode === "volume") return "";
    const per = sp.epyReq > 1 ? ` each time, ${sp.epyReq} times a year${sp.epy < sp.epyReq ? " (the chart has room for " + sp.epy + ")" : ""}` : "";
    const ms = sp.ms < sp.dur ? (sp.ms <= 1 ? ", not necessarily in a row" : `, in spells of at least ${sp.ms} days`) : "";
    return `for ${sp.dur} day${sp.dur === 1 ? "" : "s"}${per}${ms}${sp.gap > 0 ? ` (up to ${sp.gap} days out of range allowed within an event)` : ""}`;
  }
  const yrs = v => (v < 1 ? `${Math.max(1, Math.round(v * 12))} month${Math.round(v * 12) === 1 ? "" : "s"}` : `${fmt(v)} year${v === 1 ? "" : "s"}`);   // MaxInter-event is in years, sometimes under one
  const targetText = sp => (sp.tf != null ? `in ${fmt(sp.tf)}% of years` : "in some of the years");

  /** Choose readable, evenly spaced axis ticks between the supplied limits. */
  function ticks(lo, hi, n = 4) {
    const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(s => s >= raw) || mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  /** The year chart. o: line (0..1 how much of the hydrograph is drawn), thr, win, hl {days, p, col}, dim, vol */
  function yearSvg(m, y, o) {
    const sp = m.spec, L = m.L, X = d => X0 + d / (WY_DAYS - 1) * (X1 - X0), Y = v => Y1 - (v - L.ymin) / (L.ymax - L.ymin) * (Y1 - Y0);
    let s = "";
    const wa = o.win ?? 0;
    if (wa) for (const [a, b] of sp.segs) s += `<rect x="${X(a)}" y="${Y0 - 8}" width="${X(b + 1) - X(a)}" height="${Y1 - Y0 + 8}" fill="${C.acc}" opacity="${0.12 * wa}"/>`;
    for (const t of ticks(L.ymin, L.ymax)) s += `<line x1="${X0}" x2="${X1}" y1="${Y(t)}" y2="${Y(t)}" stroke="${C.grid}"/>` + T(X0 - 6, Y(t) + 4, fmt(t), { size: 10, a: "end", fill: C.mut });
    s += `<line x1="${X0}" x2="${X1}" y1="${Y1}" y2="${Y1}" stroke="${C.mut}"/><line x1="${X0}" x2="${X0}" y1="${Y0 - 8}" y2="${Y1}" stroke="${C.mut}"/>`;
    let d0 = 0;
    for (const mo of WY_MONTHS) { s += T(X(d0 + MONTH_LEN[mo] / 2), Y1 + 14, MON3[mo - 1], { size: 9.5, a: "middle", fill: C.mut }); d0 += MONTH_LEN[mo]; }
    s += T(11, (Y0 + Y1) / 2, sp.unit === "EC" ? "Salinity (EC)" : sp.mode === "level" ? "Water level (m)" : "Flow (ML/d)", { size: 10, a: "middle", fill: C.mut }).replace("<text ", `<text transform="rotate(-90 11 ${(Y0 + Y1) / 2})" `);
    if (wa) s += T((X(sp.segs[0][0]) + X(sp.segs[0][1] + 1)) / 2, Y0 - 12, `EWR window: ${windowText(sp)}`, { size: 10.5, a: "middle", w: 600, fill: C.acc, op: wa });
    const ta = o.thr ?? 0;
    if (ta && sp.mode !== "volume") {
      const lines = sp.mode === "dry" ? [[sp.hi, `≤ ${fmt(sp.hi)}`]] : [[sp.lo, `≥ ${fmt(sp.lo)}`], ...(sp.hi != null ? [[sp.hi, `≤ ${fmt(sp.hi)}`]] : [])];
      if (sp.mode === "dry") s += `<rect x="${X0}" width="${X1 - X0}" y="${Y(sp.hi)}" height="${Y1 - Y(sp.hi)}" fill="${C.org}" opacity="${0.12 * ta}"/>`;
      else if (sp.hi != null) s += `<rect x="${X0}" width="${X1 - X0}" y="${Y(Math.min(sp.hi, L.ymax))}" height="${Y(sp.lo) - Y(Math.min(sp.hi, L.ymax))}" fill="${C.org}" opacity="${0.12 * ta}"/>`;
      for (const [v, lab] of lines) {
        if (v > L.ymax) continue;   // an upper limit far above the chart (such as the default 1,000,000 ML/d) is not drawn
        const yy = Y(v), xe = X0 + (X1 - X0) * ease(Math.min(1, ta * 1.4));
        s += `<line x1="${X0}" x2="${xe}" y1="${yy}" y2="${yy}" stroke="${C.org}" stroke-width="1.8" stroke-dasharray="6 4"/>` + T(X1 - 2, yy - 5, `${lab} ${sp.unit}`, { size: 11, a: "end", w: 700, fill: C.org, op: ta });
      }
    }
    const nDraw = Math.max(1, Math.floor((o.line ?? 1) * (WY_DAYS - 1)) + 1);
    let path = "";
    for (let d = 0; d < nDraw; d++) path += (d ? "L" : "M") + X(d).toFixed(1) + " " + Y(y.flow[d]).toFixed(1);
    s += `<path d="${path}" fill="none" stroke="${C.acc}" stroke-width="1.7" stroke-linejoin="round" opacity="${o.dim ?? 1}"/>`;
    const hl = o.hl;
    if (hl && hl.days.length) {   // highlighted days in colour: a thick line over the hydrograph
      const upto = Math.ceil(hl.p * hl.days.length);
      let seg = "", prev = -9;
      hl.days.slice(0, upto).forEach(d => { seg += (d === prev + 1 ? "L" : "M") + X(d).toFixed(1) + " " + Y(y.flow[d]).toFixed(1); prev = d; });
      s += `<path d="${seg}" fill="none" stroke="${hl.col}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`;
      if (hl.days.length === 1 || upto === 1) s += `<circle cx="${X(hl.days[0])}" cy="${Y(y.flow[hl.days[0]])}" r="4.5" fill="${hl.col}"/>`;
    }
    if (sp.mode === "volume" && o.vol) {   // accumulating volume shading
      const r = y.res, upto = Math.floor(o.vol * sp.acc);
      let a = `M${X(r.at)} ${Y1}`;
      for (let d = r.at; d < r.at + upto; d++) a += `L${X(d)} ${Y(y.flow[d])}`;
      a += `L${X(r.at + Math.max(upto - 1, 0))} ${Y1}Z`;
      s += `<path d="${a}" fill="${C.ok}" opacity="0.35"/>`;
    }
    return s;
  }

  /** The strip under the chart: a progress bar and the verdict. */
  function barSvg(label, frac, col, note, badge) {
    let s = T(X0, 252, label, { size: 12.5, w: 700 });
    s += `<rect x="${X0}" y="262" width="200" height="12" rx="6" fill="${C.grid}"/><rect x="${X0}" y="262" width="${200 * clamp01(frac)}" height="12" rx="6" fill="${col}"/>`;
    s += T(X0 + 208, 272, note, { size: 9.5, fill: C.mut });
    if (badge) s += `<g opacity="${badge.op}"><rect x="${X1 - 126}" y="246" width="126" height="30" rx="8" fill="${badge.col}"/>` + T(X1 - 63, 266, badge.text, { size: 13, w: 700, a: "middle", fill: C.card }) + "</g>";
    return s;
  }

  /** Return the animated ten-year outcome strip and its tile layout coordinates. */
  function tilesSvg(m, p) {   // the 10-year strip
    let s = "";
    const tw = 42, gx = 5, x0 = (W - (10 * tw + 9 * gx)) / 2;
    m.record.forEach((y, i) => {
      const a = sub(i / 12, i / 12 + 0.2, p), x = x0 + i * (tw + gx);
      if (a <= 0) return;
      const col = y.met ? C.ok : C.bad;
      s += `<g opacity="${a}"><rect x="${x}" y="${60 - (1 - a) * 8}" width="${tw}" height="58" rx="8" fill="${col}" fill-opacity="0.14" stroke="${col}"/>` +
        T(x + tw / 2, 96 - (1 - a) * 8, y.met ? "✓" : "✗", { size: 22, w: 700, a: "middle", fill: col }) + T(x + tw / 2, 138, `Yr ${i + 1}`, { size: 9, a: "middle", fill: C.mut }) + "</g>";
    });
    return { svg: s, x0, tw, gx };
  }

  /** Build tutorial steps with captions, durations, and SVG drawing callbacks. */
  function stages(m) {
    const sp = m.spec, row = m.row;
    const common = [];
    const intro = {
      title: "What this EWR is", ms: 3200,
      cap: `${sp.unit === "EC" ? "A <b>salinity requirement</b> sets water-quality limits, when they apply, and how often they must be met." : "An <b>environmental water requirement</b> (EWR) says how much water a river site needs, when, and how often."} <b>${esc(row.c)}</b>${regimeName(row.c) ? ` is ${/^O/.test(regimeName(row.c)) ? "an" : "a"} <b>${regimeName(row.c).toLowerCase()}</b> requirement` : ""}${row.g ? ` at gauge ${esc(row.g)}${row.gn ? ` (${esc(row.gn)})` : ""}` : ""}${row.pu ? `, planning unit ${esc(row.pu)}` : ""}.`,
      draw: p => {
        let s = T(W / 2, 54, row.c, { size: 34, w: 700, a: "middle", fill: C.acc, op: ease(sub(0, 0.3, p)) });
        const lines = [[row.g ? `Gauge ${row.g}${row.gn ? " · " + row.gn : ""}` : "No gauge chosen yet", 0.2], [[row.pu, row.st].filter(Boolean).join(" · "), 0.3], [`Needs ${ruleText(sp)}`, 0.45], [sp.mode === "volume" ? `Window: ${windowText(sp)}` : `${durText(sp)} · window: ${windowText(sp)}`, 0.6], [`Target: ${targetText(sp)}${sp.mi != null ? ` · at most ${yrs(sp.mi)} between events` : ""}`, 0.75]];
        lines.forEach(([t, a], i) => { s += T(W / 2, 100 + i * 28, t, { size: t.length > 52 ? 10.5 : i >= 2 ? 13 : 12, w: i >= 2 ? 700 : 400, a: "middle", op: ease(sub(a, a + 0.2, p)), fill: i >= 2 ? C.text : C.mut }); });
        const obj = (row.eo || "").split("+").filter(Boolean).slice(0, 8);
        if (obj.length) {
          s += T(W / 2, 262, "Supports objectives", { size: 10.5, a: "middle", fill: C.mut, op: ease(sub(0.8, 1, p)) });
          const cw = 44, x0 = (W - obj.length * (cw + 4)) / 2;
          obj.forEach((o, i) => { s += `<g opacity="${ease(sub(0.8, 1, p))}"><rect x="${x0 + i * (cw + 4)}" y="270" width="${cw}" height="18" rx="9" fill="${C.acc}" fill-opacity="0.14"/>` + T(x0 + i * (cw + 4) + cw / 2, 283, o, { size: 10.5, a: "middle", w: 600, fill: C.acc }) + "</g>"; });
        }
        return s;
      },
    };
    if (!m.drawable) {
      common.push(intro);
    } else {
      const ex = m.metEx, bad = m.missEx;
      common.push(intro,
        {
          title: sp.mode === "volume" ? "Flow through the year" : sp.unit === "EC" ? "The salinity threshold" : sp.mode === "level" ? "The level threshold" : "The flow threshold", ms: 3600,
          cap: sp.mode === "volume" ? `Here is one year of daily flow at the gauge. This EWR is about the <b>total volume</b> of water, not a single flow rate.` : `Here is one year of daily ${sp.unit === "EC" ? "salinity" : sp.mode === "level" ? "water level" : "flow"} at the gauge (an illustrative record, not real data). The EWR needs <b>${esc(ruleText(sp))}</b>${sp.mode === "dry" && sp.unit !== "EC" && sp.hi <= 1 ? " (the river nearly stops flowing)" : ""}.`,
          draw: p => yearSvg(m, ex, { line: ease(sub(0, 0.6, p)), thr: ease(sub(0.55, 0.95, p)) }),
        },
        {
          title: "The EWR window", ms: 2800,
          cap: sp.whole ? "The requirement can be met at any time of the <b>July–June year</b>, so every day counts." : `Only <b>${esc(windowText(sp))}</b> counts. Values outside this window do not count towards the EWR.`,
          draw: p => yearSvg(m, ex, { thr: 1, win: ease(sub(0, 0.5, p)) }),
        },
        {
          title: sp.mode === "volume" ? "Volume" : "Duration", ms: 4600,
          cap: sp.mode === "volume" ? `Within any ${sp.acc}-day period of the window, the flow must add up to <b>${fmt(sp.vol)} ML</b>. The green area is the water counted.` : `Meeting the threshold is not enough: it must last <b>${esc(durText(sp))}</b>. The green line counts the days inside the window.`,
          draw: p => {
            const q = ease(sub(0.1, 0.9, p)), r = ex.res;
            if (sp.mode === "volume") {
              const got = r.volume * q;
              return yearSvg(m, ex, { win: 1, hl: null, vol: q }) + barSvg(`Accumulated: ${fmt(got)} ML of ${fmt(sp.vol)} ML`, got / sp.vol, C.ok, `within ${sp.acc} days`, p > 0.9 ? { col: C.ok, text: "Year met ✓", op: sub(0.9, 1, p) } : null);
            }
            const days = r.good.flatMap(([s, l]) => Array.from({ length: l }, (_, k) => s + k));
            const shown = Math.floor(q * days.length), need = sp.dur * sp.epy;
            return yearSvg(m, ex, { thr: 1, win: 1, hl: { days, p: q, col: C.ok } }) + barSvg(`Days in range: ${Math.min(shown, need)} of ${need}`, Math.min(shown, need) / need, C.ok, sp.epy > 1 ? `${sp.epy} events needed` : "", p > 0.92 ? { col: C.ok, text: "Year met ✓", op: sub(0.92, 1, p) } : null);
          },
        },
        {
          title: "A year that misses", ms: 4600,
          cap: missText(m, bad),
          draw: p => {
            const q = ease(sub(0.15, 0.9, p)), r = bad.res;
            const dim = { line: ease(sub(0, 0.35, p)) };
            if (sp.mode === "volume") {
              const got = r.volume * q;
              return yearSvg(m, bad, { win: 1, ...dim, vol: bad.type === "outside" ? 0 : q }) + barSvg(`Accumulated: ${fmt(got)} ML of ${fmt(sp.vol)} ML`, got / sp.vol, C.bad, `within ${sp.acc} days`, p > 0.92 ? { col: C.bad, text: "Year missed ✗", op: sub(0.92, 1, p) } : null);
            }
            const days = (r.runs || []).flatMap(([s, l]) => Array.from({ length: l }, (_, k) => s + k));
            const outside = [];
            if (bad.type === "outside") for (let d = 0; d < WY_DAYS; d++) if (!inWindow(sp, d) && inZone(sp, bad.flow[d])) outside.push(d);
            const need = sp.dur * sp.epy, shown = Math.floor(q * days.length);
            return yearSvg(m, bad, { thr: 1, win: 1, ...dim, hl: { days: days.length ? days : outside, p: q, col: days.length ? C.org : C.mut } }) +
              barSvg(`Days in range: ${Math.min(shown, need)} of ${need}`, Math.min(shown, need) / need, C.bad, bad.type === "outside" ? "none in window" : "", p > 0.92 ? { col: C.bad, text: "Year missed ✗", op: sub(0.92, 1, p) } : null);
          },
        });
    }
    common.push(
      {
        title: "Over the whole record", ms: 5200,
        cap: `Each year is checked the same way. Across ten example years this EWR is met in <b>${m.n ?? 6} of 10</b>, or <b>${m.pct ?? 60}%</b> of years${sp.tf != null ? `, against a target of <b>${fmt(sp.tf)}%</b>` : ""}.`,
        draw: p => {
          const t = tilesSvg(m, sub(0, 0.7, p));
          const a = ease(sub(0.7, 1, p));
          const n = m.n ?? 6, pct = m.pct ?? 60;
          let s = t.svg + `<g opacity="${a}">`;
          s += `<line x1="${X0 - 18}" x2="${X1 + 18}" y1="165" y2="165" stroke="${C.mut}"/>`;
          const cols = [[X0 + 55, "Years met", `${pct}%`, pct >= (sp.tf ?? 0) ? C.ok : C.bad], [X0 + 225, "Target", sp.tf != null ? `${fmt(sp.tf)}%` : "–", C.text], [X0 + 395, "Frequency ratio", m.frRaw != null ? m.frRaw.toFixed(2) : "–", m.frRaw != null && m.frRaw >= 1 ? C.ok : C.bad]];
          cols.forEach(([x, h, v, c]) => { s += T(x, 195, h, { size: 12, w: 700, a: "middle" }) + T(x, 235, v, { size: 30, w: 700, a: "middle", fill: c }); });
          if (m.frRaw != null) s += T(W / 2, 276, m.frRaw >= 1 ? "At or above target: counted as 1.00 (capped)" : `Below target: ${n} ÷ ${fmt(sp.tf / 10)} years = ${m.frRaw.toFixed(2)}`, { size: 11, a: "middle", fill: C.mut });
          return s + "</g>";
        },
      },
      {
        title: "Gaps between events", ms: 4200,
        cap: sp.mi != null ? `The EWR also limits how long the river can go between successful years: <b>${yrs(sp.mi)}</b> at most. The longest gap in this illustrative record is <b>${m.gap ?? 3} years</b>; it is shown only to explain the idea and is not compared with that limit.` : `This EWR has no maximum gap between events set, but the longer a river goes without a successful year, the more the ecology suffers.`,
        draw: p => {
          const t = tilesSvg(m, 1), a = ease(sub(0.2, 0.8, p));
          const idx = m.record.map((y, i) => (y.met ? i : -1)).filter(i => i >= 0);
          let best = [0, 0];
          for (let k = 1; k < idx.length; k++) if (idx[k] - idx[k - 1] > best[1] - best[0]) best = [idx[k - 1], idx[k]];
          const xa = t.x0 + best[0] * (t.tw + t.gx) + t.tw / 2, xb = t.x0 + best[1] * (t.tw + t.gx) + t.tw / 2;
          const col = C.mut;
          let s = t.svg + `<g opacity="${a}"><path d="M${xa} 150 V168 H${xb} V150" fill="none" stroke="${col}" stroke-width="2.5"/>` + T((xa + xb) / 2, 192, `${best[1] - best[0]} years between successful years (illustration)`, { size: 13, w: 700, a: "middle", fill: col });
          if (sp.mi != null) s += T((xa + xb) / 2, 216, `EWR limit: ${yrs(sp.mi)} (not compared with this illustration)`, { size: 12, a: "middle", fill: col });
          return s + "</g>";
        },
      },
      {
        title: "Putting it together", ms: 3800,
        cap: `<b>${esc(row.c)}</b> asks for ${esc(ruleText(sp))}${sp.mode === "other" || sp.mode === "volume" ? "" : " " + esc(durText(sp))}, ${sp.whole ? "at any time of year" : "between " + esc(windowText(sp))}, ${esc(targetText(sp))}${sp.mi != null ? `, with no more than ${yrs(sp.mi)} between events` : ""}. py_ewr checks every year of a ${sp.unit === "EC" ? "salinity series" : "flow series"} against that.`,
        draw: p => {
          const items = [["1", sp.unit === "EC" ? "Salinity" : "Flow", ruleText(sp)], ["2", "Window", windowText(sp)], ["3", sp.mode === "volume" ? "Volume" : "Duration", sp.mode === "volume" ? `within ${sp.acc} days` : durText(sp).replace(/^for /, "")], ["4", "Frequency", sp.tf != null ? `${fmt(sp.tf)}% of years` : "–"], ["5", "Gap", sp.mi != null ? `≤ ${yrs(sp.mi)}` : "–"]];
          return items.map(([n, h, v], i) => {
            const a = ease(sub(i * 0.15, i * 0.15 + 0.3, p)), y = 56 + i * 44;
            return `<g opacity="${a}">` + T(60, y + 4, n, { size: 22, w: 700, fill: C.acc }) + T(94, y - 2, h, { size: 11, fill: C.mut }) + T(94, y + 16, v.length > 70 ? v.slice(0, 68) + "…" : v, { size: 14, w: 700 }) + "</g>";
          }).join("");
        },
      });
    return common;
  }

  /** Explain why the example year misses the rule, using its evaluated result. */
  function missText(m, bad) {
    const sp = m.spec, r = bad.res;
    const text = {
      short: () => `The ${sp.unit === "EC" ? "salinity" : "flow"} reaches the threshold, but for only <b>${r.all ?? 0} day${r.all === 1 ? "" : "s"}</b> – it was needed for <b>${sp.dur}</b>. Not enough.`,
      outside: () => `${sp.unit === "EC" ? "Salinity" : "Flow"} is right and lasts long enough, but <b>outside the EWR window</b> (${esc(windowText(sp))}), so it does not count.`,
      over: () => `${sp.unit === "EC" ? "Salinity" : "Flow"} rises <b>above the upper limit</b> of ${fmt(sp.hi)} ${sp.unit}, outside the range the EWR wants, so those days do not count.`,
      low: () => sp.mode === "volume" ? `Only about <b>${fmt(r.volume)} ML</b> builds up – short of the <b>${fmt(sp.vol)} ML</b> needed.`
        : sp.mode === "dry" ? `${sp.unit === "EC" ? "Salinity remains too high" : "The river never drops low enough: flow stays above"} <b>${fmt(sp.hi)} ${sp.unit}</b>, so the EWR is not met.`
        : `${sp.unit === "EC" ? "Salinity" : "Flow"} peaks <b>below the threshold</b> of ${fmt(sp.lo)} ${sp.unit}, so no day counts.`,
    };
    return "Now a year with a different outcome. " + (text[bad.type] || text.low)();
  }

  // ---- the player ----
  let cur = null;   // {box, sig, st, list, paint}
  let raf = 0;
  /** Advance the playing walkthrough one frame. */
  function loop(now) {
    raf = 0;
    if (!cur || !cur.st.playing) return;
    const st = cur.st, s = cur.list[st.i];
    if (st.hold) { if (now - st.hold > 1100) { st.hold = 0; if (st.i < cur.list.length - 1) cur.go(st.i + 1); else { cur.stop(); return; } } }
    else { st.p = clamp01((now - st.t0) / s.ms); cur.paint(); if (st.p >= 1) st.hold = now; }
    raf = requestAnimationFrame(loop);
  }

  /** Fill box with the walkthrough of guide row `row`. o.autoplay starts it playing; o.keepStep stays on the current step when the same box is redrawn. */
  function show(box, row, o = {}) {
    const sig = JSON.stringify(row);
    if (cur && cur.box === box && cur.sig === sig) { if (o.autoplay) cur.play(); return; }
    const keep = cur && cur.box === box && o.keepStep ? { i: cur.st.i, playing: cur.st.playing } : null;
    if (cur) cur.stop();
    if (!C.text) theme();
    const what = ruleSummary(row);
    if (!ewrSupported(row)) {
      box.innerHTML = `${what ? `<p class="gwhat">${esc(what)}</p>` : ""}<div class="gdev"><b>Animated walkthrough not available for this rule type yet</b><br>${esc(row.c)} is calculated by py_ewr's <code>${esc(row.h || "unknown")}</code>; walkthroughs so far cover continuous-spell and total-days rules (<code>flow_handle</code> and <code>lowflow_handle</code>).</div>`;
      cur = null;
      return;
    }
    const m = { ...buildTutorial(ewrSpec(row)), row }, list = stages(m);
    box.innerHTML = `${what ? `<p class="gwhat">${esc(what)}</p>` : ""}<div class="gstage"></div><div class="gcap" aria-live="polite"></div><svg class="gsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Walkthrough of ${esc(row.c)}"></svg>
      <div class="gctl"><button type="button" class="ghost" data-a="prev" aria-label="Previous step">‹ Back</button><button type="button" class="ghost" data-a="play">▶ Play</button><button type="button" class="ghost" data-a="next" aria-label="Next step">Next ›</button><button type="button" class="ghost" data-a="replay" aria-label="Replay from the start">↺ Replay</button><span class="gdots"></span></div>
      <div class="gnote">${m.drawable ? "Illustrative record generated from this EWR's parameters – not gauge data." : "No drawable threshold for this EWR; the steps use its other parameters."}</div>`;
    const svg = box.querySelector(".gsvg"), cap = box.querySelector(".gcap"), stg = box.querySelector(".gstage"), playBtn = box.querySelector('[data-a="play"]'), dots = box.querySelector(".gdots");
    dots.innerHTML = list.map((s, i) => `<button type="button" data-i="${i}" aria-label="Step ${i + 1}: ${esc(s.title)}" title="${esc(s.title)}"></button>`).join("");
    const st = { i: 0, p: 1, playing: false, t0: 0, hold: 0 };
    const c = {
      box, sig, st, list,
      paint() {
        const s = list[st.i];
        stg.textContent = `Step ${st.i + 1} of ${list.length} · ${s.title}`;
        if (cap.dataset.i !== String(st.i)) { cap.innerHTML = s.cap; cap.dataset.i = st.i; }
        svg.innerHTML = s.draw(st.p);
        dots.querySelectorAll("button").forEach((b, k) => b.className = k === st.i ? "on" : k < st.i ? "done" : "");
        playBtn.textContent = st.playing ? "⏸ Pause" : "▶ Play";
      },
      go(i, p = 0) { st.i = Math.max(0, Math.min(list.length - 1, i)); st.p = p; st.t0 = performance.now(); st.hold = 0; c.paint(); },
      play() {
        if (reduced()) { st.p = 1; c.paint(); return; }
        if (st.i === list.length - 1 && st.p >= 1) c.go(0);
        else if (st.p >= 1) c.go(st.i, 0);
        st.playing = true; st.t0 = performance.now() - st.p * list[st.i].ms; c.paint();
        if (!raf) raf = requestAnimationFrame(loop);
      },
      stop() { st.playing = false; c.paint(); },
    };
    box.querySelector(".gctl").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const a = b.dataset.a;
      if (a === "play") st.playing ? c.stop() : c.play();
      else if (a === "next") { const was = st.playing; c.go(st.i + 1, 1); if (was) c.play(); }
      else if (a === "prev") { const was = st.playing; c.go(st.i - 1, 1); if (was) c.play(); }
      else if (a === "replay") { c.go(0); c.play(); }
      else if (b.dataset.i != null) { const was = st.playing; c.go(+b.dataset.i, 1); if (was) c.play(); }
    });
    cur = c;
    c.go(keep ? keep.i : 0, 1);
    if (o.autoplay || keep?.playing) c.play();
  }

  document.addEventListener("visibilitychange", () => { if (document.hidden && cur?.st.playing) { cur.st.p = 1; cur.stop(); } });   // paused fully drawn, not mid-frame
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { theme(); if (cur) cur.paint(); });
  /** Stop any walkthrough in box and show html there instead. */
  function clear(box, html = "") { if (cur && cur.box === box) { cur.stop(); cur = null; } box.innerHTML = html; }
  return { show, clear };
})();
