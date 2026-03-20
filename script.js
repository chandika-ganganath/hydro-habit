/**
 * HYDRO-HABIT — script.js
 * ───────────────────────────────────────────────────────
 *  Handles:
 *   1. Navbar scroll effect
 *   2. Hero hydration card animation
 *   3. Scroll-reveal observer
 *   4. Simulation state machine (Place → SET → Lift → PlaceBack → repeat)
 *   5. Smooth anchor scrolling
 */

/* ═══════════════════════════════════════════
   1. NAVBAR SCROLL EFFECT
   ═══════════════════════════════════════════ */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });


/* ═══════════════════════════════════════════
   2. HERO HYDRATION BAR ANIMATION
   ═══════════════════════════════════════════ */
window.addEventListener('load', () => {
  setTimeout(() => {
    const bar = document.getElementById('hvc-bar');
    const val = document.getElementById('hvc-val');
    if (bar) bar.style.width = '73%'; // 1840 of 2500ml
    if (val) val.innerHTML = '1,840 <span>ml</span>';
  }, 700);
});


/* ═══════════════════════════════════════════
   3. SCROLL REVEAL
   ═══════════════════════════════════════════ */
const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('vis');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));


/* ═══════════════════════════════════════════
   4. SIMULATION STATE MACHINE
   ═══════════════════════════════════════════

   States:
   ┌──────────────────────────────────────────────────────┐
   │ IDLE       → [Place Mug]    → MUG_PLACED            │
   │ MUG_PLACED → [SET/START]    → TRACKING              │
   │ TRACKING   → [Lift & Drink] → LIFTED                │
   │ LIFTED     → [Place Back]   → TRACKING  (sip logged)│
   │ Any active → [RESET/SWAP]   → IDLE (red flash)      │
   └──────────────────────────────────────────────────────┘

   LED colours:
   • IDLE       → breathing teal
   • MUG_PLACED → breathing teal (waiting for SET)
   • TRACKING   → solid GREEN
   • LIFTED     → pulsing ORANGE  (mug in hand)
   • RESETTING  → RED x2 flashes → back to breathing teal
*/

/* ── DOM refs ── */
const mugFloat  = document.getElementById('mug-float');
const mugLiquid = document.getElementById('mug-liquid');
const steamWrap = document.getElementById('steam-wrap');
const drinkArc  = document.getElementById('drink-arc');
const ledRing   = document.getElementById('led-ring');

const scBadge   = document.getElementById('sc-badge');
const scDot     = document.getElementById('sc-dot');
const scLedTxt  = document.getElementById('sc-led-txt');
const scMug     = document.getElementById('sc-mug');
const scLifted  = document.getElementById('sc-lifted');
const scLast    = document.getElementById('sc-last');
const scTotal   = document.getElementById('sc-total');

const instrLog  = document.getElementById('instr-log');
const sipEmpty  = document.getElementById('sip-empty');
const sipList   = document.getElementById('sip-list');
const sipPopup  = document.getElementById('sip-popup');

const cbAmount  = document.getElementById('cb-amount');
const cbProg    = document.getElementById('cb-prog');

const btnPlace  = document.getElementById('btn-place');
const btnStart  = document.getElementById('btn-start');
const btnLift   = document.getElementById('btn-lift');
const btnBack   = document.getElementById('btn-back');
const btnReset  = document.getElementById('btn-reset');

/* ── Simulation state ── */
let state       = 'IDLE';
let mugWeight   = 0;     // current weight in grams on coaster
let baseWeight  = 0;     // tare weight when SET was pressed (empty reading)
let sipCount    = 0;     // number of sips taken
let totalDrunk  = 0;     // total ml consumed in session
let sipDelta    = 0;     // ml for the current sip (set on lift)

/* ── Timing constants — easy to tweak ── */
const T = {
  MUG_SETTLE   : 400,   // ms after mug placed before buttons enable
  RED_FLASH_ON : 260,   // ms each red flash is ON
  RED_FLASH_OFF: 170,   // ms gap between red flashes
  RED_COUNT    : 2,     // number of red flashes on RESET
  AFTER_RED    : 350,   // ms after last flash before returning to IDLE
  POPUP_SHOW   : 2200,  // ms the sip popup stays visible
};

/* ── Helpers ── */

/** Replace the instruction log content */
function setLog(html) {
  instrLog.innerHTML = `<p class="il il-on">${html}</p>`;
}

/** Set LED visual state */
function setLed(mode) {
  ledRing.className = 'led-ring';          // reset classes
  scDot.className   = 'sc-dot';

  switch (mode) {
    case 'breathe':
      scLedTxt.textContent = 'Breathing Teal';
      break;
    case 'green':
      ledRing.classList.add('led-green');
      scDot.classList.add('dot-green');
      scLedTxt.textContent = 'Solid Green ●';
      break;
    case 'orange':
      ledRing.classList.add('led-orange');
      scDot.classList.add('dot-orange');
      scLedTxt.textContent = 'Pulsing Orange ●';
      break;
    case 'red':
      ledRing.classList.add('led-red');
      scDot.classList.add('dot-red');
      scLedTxt.textContent = 'Flashing Red ●';
      break;
    case 'dim':
      ledRing.classList.add('led-dim');
      scDot.classList.add('dot-dim');
      scLedTxt.textContent = 'Off';
      break;
  }
}

/** Enable / disable buttons */
function setBtns({ place=false, start=false, lift=false, back=false, reset=false }) {
  btnPlace.disabled = !place;
  btnStart.disabled = !start;
  btnLift .disabled = !lift;
  btnBack .disabled = !back;
  btnReset.disabled = !reset;
}

/** Update session-total display */
function updateTotal(ml) {
  totalDrunk = ml;
  const pct = Math.min((totalDrunk / 2500) * 100, 100);
  cbAmount.textContent = totalDrunk + ' ml';
  cbProg.style.width   = pct + '%';
  scTotal.textContent  = totalDrunk + ' ml';

  // Also sync the hero floating card
  const hvcBar = document.getElementById('hvc-bar');
  const hvcVal = document.getElementById('hvc-val');
  if (hvcBar) hvcBar.style.width = Math.min(((1840 + totalDrunk) / 2500) * 100, 100) + '%';
  if (hvcVal) hvcVal.innerHTML   = (1840 + totalDrunk).toLocaleString() + ' <span>ml</span>';
}

/** Show the per-sip popup bubble */
let popupTimer = null;
function showSipPopup(ml) {
  sipPopup.textContent = `+${ml} ml 💧`;
  sipPopup.classList.add('show');
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => sipPopup.classList.remove('show'), T.POPUP_SHOW);
}

/** Add a row to the sip history list */
function addSipRow(n, ml, totalSoFar) {
  if (sipEmpty) sipEmpty.style.display = 'none';
  const li = document.createElement('li');
  li.className = 'sip-item';
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.innerHTML = `
    <span class="sip-n">Sip #${n}</span>
    <span>${time}</span>
    <span class="sip-v">+${ml} ml</span>
    <span style="color:var(--txt-3);font-size:.7rem">= ${totalSoFar} ml</span>
  `;
  sipList.prepend(li); // newest at top
}

/** Flash LED red N times then call callback */
function flashRed(times, onDone) {
  let count = 0;
  function tick() {
    if (count >= times) { setLed('dim'); setTimeout(onDone, T.AFTER_RED); return; }
    setLed('red');
    setTimeout(() => { setLed('dim'); count++; setTimeout(tick, T.RED_FLASH_OFF); }, T.RED_FLASH_ON);
  }
  tick();
}

/* ── State transitions ── */

function enterIdle() {
  state = 'IDLE';

  // Reset mug position and appearance
  mugFloat.classList.remove('on-coaster', 'lifted');
  mugLiquid.style.height = '55%';

  setLed('breathe');
  scBadge.className = 'sc-badge';
  scBadge.textContent = 'STANDBY';
  scMug.textContent    = 'No';
  scLifted.textContent = 'No';
  scLast.textContent   = '—';

  setBtns({ place: true });
  setLog('💧 Click <strong>Place Mug</strong> to put your mug on the coaster.');
}

function enterMugPlaced() {
  state = 'MUG_PLACED';

  // Simulate a random mug + liquid weight (180–540g)
  mugWeight = Math.floor(Math.random() * 360) + 180;

  mugFloat.classList.add('on-coaster');
  mugFloat.classList.remove('lifted');

  setLed('breathe');
  scBadge.className    = 'sc-badge';
  scBadge.textContent  = 'MUG DETECTED';
  scMug.textContent    = 'Yes';
  scLifted.textContent = 'No';

  // Enable SET/START and RESET after mug settles
  setTimeout(() => {
    setBtns({ start: true, reset: true });
    setLog(`☕ Mug on coaster! Detected weight: <strong>${mugWeight} g</strong>. Press <strong>SET / START</strong> to begin tracking.`);
  }, T.MUG_SETTLE);
}

function enterTracking(isReturnFromLift = false) {
  state = 'TRACKING';

  // If this is the initial SET, record the base tare weight
  if (!isReturnFromLift) {
    baseWeight = mugWeight;
  }

  mugFloat.classList.add('on-coaster');
  mugFloat.classList.remove('lifted');

  setLed('green');
  scBadge.className    = 'sc-badge active';
  scBadge.textContent  = 'TRACKING';
  scLifted.textContent = 'No';

  setBtns({ lift: true, reset: true });

  if (!isReturnFromLift) {
    setLog('▶ <strong>Tracking active!</strong> LED is solid green. Click <strong>Lift &amp; Drink</strong> to simulate taking a sip.');
  } else {
    setLog(`✅ Mug placed back. Last sip: <strong>${sipDelta} ml</strong>. Lift again for another sip, or <strong>RESET</strong> to end.`);
  }
}

function enterLifted() {
  state = 'LIFTED';

  // Simulate drinking: random sip between 40–160 ml
  sipDelta  = Math.floor(Math.random() * 121) + 40;
  mugWeight = Math.max(mugWeight - sipDelta, 20); // don't go below 20g

  // Move mug up and to the side (tilting to drink)
  mugFloat.classList.add('lifted');
  mugFloat.classList.remove('on-coaster');

  // Reduce liquid level in mug
  const newPct = Math.max(10, parseFloat(mugLiquid.style.height || '55') - sipDelta * 0.1);
  mugLiquid.style.height = newPct + '%';

  setLed('orange');
  scBadge.className    = 'sc-badge lifting';
  scBadge.textContent  = 'MUG LIFTED';
  scLifted.textContent = 'Yes — Drinking...';

  setBtns({ back: true, reset: true });
  setLog(`🤲 Mug lifted! Simulating a sip of <strong>~${sipDelta} ml</strong>. Put the mug back when done.`);
}

function recordSip() {
  // Called when mug is placed back after a lift
  sipCount++;
  totalDrunk += sipDelta;

  scLast.textContent = `${sipDelta} ml`;
  updateTotal(totalDrunk);
  showSipPopup(sipDelta);
  addSipRow(sipCount, sipDelta, totalDrunk);

  enterTracking(true); // return to TRACKING state
}

function enterResetting() {
  state = 'RESETTING';
  setBtns({});   // disable all during flash
  scBadge.className   = 'sc-badge error';
  scBadge.textContent = 'RESETTING';
  setLog('🔴 Resetting session… LED flashing <strong>red</strong>.');

  flashRed(T.RED_COUNT, () => {
    // Reset session counters
    sipCount   = 0;
    totalDrunk = 0;
    sipDelta   = 0;
    mugWeight  = 0;

    // Clear sip log
    sipList.innerHTML = '';
    if (sipEmpty) sipEmpty.style.display = 'block';
    updateTotal(0);
    scLast.textContent = '—';

    // Reset the hero bar to its default value
    const hvcBar = document.getElementById('hvc-bar');
    const hvcVal = document.getElementById('hvc-val');
    if (hvcBar) hvcBar.style.width = '73%';
    if (hvcVal) hvcVal.innerHTML   = '1,840 <span>ml</span>';

    enterIdle();
  });
}

/* ── Button listeners ── */

btnPlace.addEventListener('click', () => {
  if (state === 'IDLE') enterMugPlaced();
});

btnStart.addEventListener('click', () => {
  if (state === 'MUG_PLACED') enterTracking(false);
});

btnLift.addEventListener('click', () => {
  if (state === 'TRACKING') enterLifted();
});

btnBack.addEventListener('click', () => {
  if (state === 'LIFTED') recordSip();
});

btnReset.addEventListener('click', () => {
  if (['MUG_PLACED', 'TRACKING', 'LIFTED'].includes(state)) {
    enterResetting();
  }
});

/* ── Initialise simulation ── */
enterIdle();


/* ═══════════════════════════════════════════
   5. SMOOTH ANCHOR SCROLLING
   ═══════════════════════════════════════════ */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});