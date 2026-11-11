import React, {useEffect, useRef, useState} from 'react';
import s from './charts.module.css';

// The same requests, in the same order, go through each gateway at 50 rps. Each dot is held in
// its gateway's box for that gateway's median overhead at 50 rps (headline.csv), with time slowed
// 20x. Arrivals are seeded, and the server render and the first client render show the same
// frame, so hydration matches.

const SLOW = 20;
const RPS = 50;
// One loop of arrivals, in on-screen seconds.
const LOOP = 16;
const N = Math.round((RPS / SLOW) * LOOP);
const SPEED = 150; // px per on-screen second, outside the boxes
const START = 76;
const BOX_X = 300;
const BOX_W = 150;
const END = 600;
const LEG_IN = (BOX_X - START) / SPEED;
const LEG_OUT = (END - BOX_X - BOX_W) / SPEED;
// The frame rendered on the server and shown under prefers-reduced-motion.
const STILL = 8;

const LANES = [
  {key: 'rust', name: '🦀 Rust', p50: 0.9, box: 'tintRs', dot: 'fillRs', ink: 'tRs'},
  {key: 'bifrost', name: 'Bifrost', p50: 1.2, box: 'tintBox', dot: 'fillGray', ink: 'tGray'},
  {key: 'portkey', name: 'Portkey', p50: 2.1, box: 'tintBox', dot: 'fillPale', ink: 'tPale'},
  {key: 'python', name: '🐍 Python', p50: 79.3, box: 'tintPy', dot: 'fillPy', ink: 'tPy'},
].map((lane, i) => ({...lane, y: 76 + i * 60, hold: (lane.p50 / 1000) * SLOW}));

// Poisson arrivals over one loop: seeded exponential gaps, scaled to fill the loop exactly.
const ARRIVALS = (() => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gaps = Array.from({length: N}, () => -Math.log(1 - rnd()));
  const total = gaps.reduce((a, b) => a + b, 0);
  let at = 0;
  return gaps.map(g => (at += (g / total) * LOOP) - (g / total) * LOOP);
})();

const cx = (...names) => names.filter(Boolean).map(name => s[name]).join(' ');

// Requests sent, and requests out of a lane's box, by on-screen time t.
const countBy = (t, offset) => {
  const cycle = Math.floor(t / LOOP);
  const within = c => ARRIVALS.filter(a => c * LOOP + a + offset <= t).length;
  return Math.max(cycle - 1, 0) * N + (cycle >= 1 ? within(cycle - 1) : 0) + within(cycle);
};

const fmtTime = ms => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

function dotsFor(lane, t) {
  const dots = [];
  const cycle = Math.floor(t / LOOP);
  for (const c of [cycle - 1, cycle]) {
    if (c < 0) continue;
    ARRIVALS.forEach((a, k) => {
      const age = t - (c * LOOP + a);
      if (age < 0) return;
      if (age < LEG_IN) dots.push({k: `${c}-${k}`, x: START + age * SPEED, out: false});
      else if (age < LEG_IN + lane.hold) dots.push({k: `${c}-${k}`, x: BOX_X + 8 + ((age - LEG_IN) / lane.hold) * (BOX_W - 16), out: true});
      else if (age < LEG_IN + lane.hold + LEG_OUT) {
        const x = BOX_X + BOX_W + (age - LEG_IN - lane.hold) * SPEED;
        dots.push({k: `${c}-${k}`, x, out: true, fade: Math.min(1, (END - x) / 40)});
      }
    });
  }
  return dots;
}

export default function LanesHero() {
  const [t, setT] = useState(STILL);
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let frame = 0;
    let last = null;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    if (ref.current) observer.observe(ref.current);
    const tick = now => {
      if (last !== null && visible) setT(prev => prev + Math.min(now - last, 100) / 1000);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <LanesFrame t={t} figRef={ref} />;
}

// One frame of the hero at on-screen time t.
export function LanesFrame({t, figRef}) {
  const sent = countBy(t, 0);
  return (
    <figure className={s.fig} ref={figRef}>
      <div className={s.art}>
        <div className={s.head}>
          <span className={s.eyebrow}>
            <span className={s.num}>50 RPS</span>
            SAME REQUESTS, SAME ORDER · FULL FEATURES
          </span>
          <p className={s.title}>Every request passes through the gateway. How long does it stay?</p>
        </div>
        <div className={s.scroll}>
          <svg
            className={s.svg}
            viewBox="0 0 760 290"
            role="img"
            aria-label="Requests arrive at 50 per second and pass through four gateways, in four lanes. Each request is held in its gateway for that gateway's median overhead: LiteLLM Rust 0.9 ms, Bifrost 1.2 ms, Portkey 2.1 ms, LiteLLM Python 79.3 ms. Rust, Bifrost and Portkey pass requests through almost at once; in the Python lane, requests bunch up inside the gateway. A counter beside each lane adds up the time requests have spent in that gateway.">
            <text x={20} y={28} className={s.e}>REQUESTS IN</text>
            <text x={BOX_X} y={28} className={s.e}>GATEWAY</text>
            <text x={630} y={28} className={s.e}>TIME IN GATEWAY</text>

            <rect x={20} y={46} width={56} height={226} rx={10} className={s.tintBox} />
            <text x={48} y={150} className={s.t} textAnchor="middle">{sent.toLocaleString('en-US')}</text>
            <text x={48} y={168} className={s.s} textAnchor="middle">sent</text>

            {LANES.map(lane => {
              const served = countBy(t, LEG_IN + lane.hold);
              return (
                <g key={lane.key}>
                  <path d={`M${START} ${lane.y}H${END}`} className={s.rail} />
                  <text x={BOX_X} y={lane.y - 20} className={cx('s', 'bold', lane.ink)}>{lane.name}</text>
                  <text x={BOX_X + BOX_W} y={lane.y - 20} className={s.tick} textAnchor="end">{lane.p50} ms</text>
                  <rect x={BOX_X} y={lane.y - 14} width={BOX_W} height={28} rx={8} className={s[lane.box]} />
                  {dotsFor(lane, t).map(d => (
                    <circle key={d.k} cx={d.x} cy={lane.y} r={4} className={d.out ? s[lane.dot] : s.dotIn} opacity={d.fade ?? 1} />
                  ))}
                  <text x={630} y={lane.y + 5} className={cx('val', 'big', lane.ink)}>{fmtTime(served * lane.p50)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <figcaption>
        Slowed down 20×. Every lane gets the same arrivals, and each request is held for its gateway's median overhead at 50 rps,
        measured against a direct-to-mock run. Full features; Portkey has none.
      </figcaption>
    </figure>
  );
}
