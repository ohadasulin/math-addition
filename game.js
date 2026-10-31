const $ = (id) => document.getElementById(id);

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (list) => list[randInt(0, list.length - 1)];

const CONFIG = {
  firstTryToFinishLevel: 8,   // first-try answers that fill the bar
  gentleOpening: 2,           // first problems of a level use the small numbers
  reviewChance: 0.3,          // share of problems taken from easier levels
  wrongInARowToEase: 2,       // this many missed problems triggers easier ones...
  easyRounds: 3,              // ...for this many problems
  cratesFromLevel: 6,
  scenes: [
    { bg: "img/bg_temple.webp",   toucan: { left: 6, top: 395 } },
    { bg: "img/bg_clearing.webp", toucan: { left: 1252, top: 640, flip: true } },
  ],
  fruits: ["fruit_orange"],   // add e.g. "fruit_apple" once img/fruit_apple.webp exists
};

// Seconds for each question (null = no toucan) and lucky leaves, by level.
const LEVEL_RULES = [
  [null, 6], [null, 6], [12, 6], [12, 6], [12, 6], [12, 5], [12, 5],
  [12, 5], [12, 5], [14, 4], [14, 4], [16, 3], [14, 2],
].map(([seconds, leaves]) => ({ seconds, leaves }));
const rules = () => LEVEL_RULES[Math.min(state.level, LEVEL_RULES.length) - 1];
const CHECKPOINT = 4;        // a nap never drops the bar below this once it's reached
const EASED_EXTRA_SECONDS = 5;
const TOUCAN_HOPS = 12;
const TOUCAN_ROAD = 860;     // pixels from the start of the branch to the banana

// Each level adds one idea. Every entry returns [a, b]; `gentle` means the smallest version.
const twoDigitNoCarry = (gentle) => {
  const tensA = randInt(1, gentle ? 2 : 6), tensB = randInt(1, gentle ? 1 : 8 - tensA);
  const onesA = randInt(1, gentle ? 3 : 8), onesB = randInt(1, gentle ? 3 : 9 - onesA);
  return [tensA * 10 + onesA, tensB * 10 + onesB];
};
const carryOnes = (gentle) => {       // two ones digits that make a new crate
  if (gentle) return pick([[9, 2], [9, 3], [8, 3], [8, 2]]);
  const a = randInt(2, 9);
  return [a, randInt(Math.max(2, 11 - a), 9)];
};
const LEVELS = [
  /* 1  to 5       */ (g) => { const a = randInt(1, g ? 2 : 4); return [a, randInt(1, (g ? 3 : 5) - a)]; },
  /* 2  to 7       */ (g) => { const a = randInt(1, g ? 3 : 5); return [a, randInt(Math.max(1, 4 - a), (g ? 5 : 7) - a)]; },
  /* 3  to 10      */ (g) => { const a = randInt(1, g ? 5 : 8); return [a, randInt(Math.max(1, 6 - a), (g ? 8 : 10) - a)]; },
  /* 4  doubles, 10*/ (g) => {
    if (g) { const d = randInt(1, 3); return [d, d]; }
    if (Math.random() < 0.5) { const d = randInt(2, 5); return [d, d]; }
    const a = randInt(1, 9); return [a, 10 - a];
  },
  /* 5  adding 0   */ (g) => { const n = randInt(1, g ? 3 : 9); return Math.random() < 0.5 ? [n, 0] : [0, n]; },
  /* 6  meet crate */ (g) => { const n = randInt(1, g ? 3 : 9); return Math.random() < 0.5 ? [10, n] : [n, 10]; },
  /* 7  crates only*/ (g) => {
    if (g) return pick([[10, 10], [20, 10], [10, 20]]);
    const a = randInt(1, 7); return [a * 10, randInt(1, 8 - a) * 10];
  },
  /* 8  few loose  */ (g) => {
    const ones = randInt(1, g ? 4 : 7), tens = randInt(1, g ? 2 : 8);
    return [tens * 10 + ones, randInt(1, (g ? 5 : 9) - ones)];
  },
  /* 9  both sides */ twoDigitNoCarry,
  /* 10 new crate  */ carryOnes,
  /* 11 crate + new*/ (g) => {
    const [x, y] = carryOnes(g);
    return [randInt(1, g ? 1 : 6) * 10 + x, y];
  },
  /* 12 both, new  */ (g) => {
    const [x, y] = carryOnes(g);
    const tensA = randInt(1, g ? 1 : 4), tensB = randInt(1, g ? 1 : 7 - tensA);
    return [tensA * 10 + x, tensB * 10 + y];
  },
  /* 13 up to 99   */ (g) => {
    if (g) return LEVELS[11](true);
    const a = randInt(11, 79);
    return [a, randInt(11, 99 - a)];
  },
];

// Where each fruit sits in the basket (percent of basket size), back row first.
const FRUIT_LAYOUT = {
  0: [],
  1: [[37, 26]],
  2: [[24, 26], [50, 26]],
  3: [[11, 16], [37, 12], [62, 16]],
  4: [[24, 8], [50, 8], [24, 30], [50, 30]],
  5: [[11, 6], [37, 3], [62, 6], [24, 30], [50, 30]],
  6: [[11, 6], [37, 3], [62, 6], [11, 30], [37, 32], [62, 30]],
  7: [[6, 2], [28, 0], [50, 0], [72, 2], [17, 26], [39, 28], [61, 26]],
  8: [[6, 2], [28, 0], [50, 0], [72, 2], [6, 26], [28, 28], [50, 28], [72, 26]],
  9: [[2, 5], [21, 0], [40, 0], [59, 0], [78, 5], [12, 28], [31, 30], [50, 30], [69, 28]],
};

const state = {
  bananas: 0, level: 1, progress: 0,
  busy: true, paused: false, round: null, last: "",
  roundNo: 0, levelRounds: 0, wrongStreak: 0, easyLeft: 0, retry: [],
  leaves: 0, relaxed: false, introShown: false,
};
try {
  state.relaxed = localStorage.getItem("jm-relaxed") === "yes";
  const saved = JSON.parse(localStorage.getItem("jm-progress") || "{}");
  for (const k of ["bananas", "level", "progress"]) if (Number.isFinite(saved[k])) state[k] = saved[k];
} catch {}
// Preview any level with ?level=12 in the address.
const previewLevel = Number(new URLSearchParams(location.search).get("level"));
if (Number.isInteger(previewLevel) && previewLevel >= 1) { state.level = previewLevel; state.progress = 0; }
const saveProgress = () => {
  try { localStorage.setItem("jm-progress", JSON.stringify({ bananas: state.bananas, level: state.level, progress: state.progress })); } catch {}
};

// Timers stop while the game is paused.
function wait(ms) {
  return new Promise((done) => {
    let left = ms, prev = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      if (!state.paused) left -= now - prev;
      prev = now;
      if (left <= 0) { clearInterval(id); done(); }
    }, 30);
  });
}

// Fast mode, switched from the pause screen: speeds up question starts and misses.
// Adding ?fast to the address also turns it on.
let fastMode = new URLSearchParams(location.search).has("fast");
try { fastMode = fastMode || localStorage.getItem("jm-fast") === "yes"; } catch {}
const quick = (ms) => wait(fastMode ? ms * 0.15 : ms);

const makesCrate = (a, b) => state.level >= CONFIG.cratesFromLevel && a % 10 + b % 10 >= 10;

// Right answer plus two wrong ones. Bigger numbers use the mistakes kids really make.
function answerChoices(a, b) {
  const answer = a + b;
  if (answer <= 10) {
    const first = Math.max(1, answer - randInt(0, 2));
    return [first, first + 1, first + 2];
  }
  const near = Math.random() < 0.5 ? [1, -1] : [-1, 1];
  const far = Math.random() < 0.5 ? [10, -10] : [-10, 10];
  let offsets;
  if (a % 10 === 0 && b % 10 === 0) offsets = [...far, 20, -20];
  else if (makesCrate(a, b)) offsets = [-10, near[0], near[1], 10];   // -10: forgot the new crate
  else offsets = [far[0], near[0], far[1], near[1]];
  const wrong = offsets.map((o) => answer + o).filter((n) => n >= 1 && n <= 99).slice(0, 2);
  return [answer, ...wrong].sort((x, y) => x - y);
}

function pickRound() {
  state.roundNo++;
  const eased = state.easyLeft > 0;
  const due = state.retry.findIndex((q) => q.due <= state.roundNo);
  if (due >= 0) {
    const [{ a, b }] = state.retry.splice(due, 1);
    return { a, b, eased, answer: a + b, options: answerChoices(a, b) };
  }
  const top = Math.min(state.level, LEVELS.length);
  let from = top, gentle = false;
  if (state.easyLeft > 0) {
    state.easyLeft--;
    from = Math.max(1, top - 1);
    gentle = true;
  } else if (state.levelRounds < CONFIG.gentleOpening) {
    gentle = true;
  } else if (top > 1 && Math.random() < CONFIG.reviewChance) {
    from = randInt(Math.max(1, top - 3), top - 1);
  }
  state.levelRounds++;
  let a, b, tries = 0;
  do { [a, b] = LEVELS[from - 1](gentle); } while (`${a}+${b}` === state.last && ++tries < 20);
  state.last = `${a}+${b}`;
  return { a, b, eased, answer: a + b, options: answerChoices(a, b) };
}

document.documentElement.classList.toggle("fast", fastMode);

function fitStage() {
  $("stage").style.transform = `scale(${Math.min(innerWidth / 1448, innerHeight / 1086)})`;
}

function setScene() {
  const scene = CONFIG.scenes[(state.level - 1) % CONFIG.scenes.length];
  $("bg").src = scene.bg;
  $("backdrop").style.backgroundImage = `url(${scene.bg})`;
  Object.assign($("toucan").style, { left: `${scene.toucan.left}px`, top: `${scene.toucan.top}px` });
  $("toucan").classList.toggle("flip", !!scene.toucan.flip);
}

function renderHud() {
  $("count").textContent = state.bananas;
  const seg = $("segments");
  if (!seg.children.length) seg.innerHTML = "<i></i>".repeat(CONFIG.firstTryToFinishLevel);
  [...seg.children].forEach((el, i) => el.classList.toggle("on", i < state.progress));
}

const LEAF_SVG = `<svg class="leaf" viewBox="0 0 36 50" aria-hidden="true"><defs><linearGradient id="leafG" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#a6e23a"/><stop offset="1" stop-color="#3f9a1c"/></linearGradient></defs><path d="M18 2C31 11 34 28 18 48C2 28 5 11 18 2Z" fill="url(#leafG)" stroke="#23620f" stroke-width="2"/><path d="M18 5V44M18 18L26 12M18 18L10 12M18 30L25 24M18 30L11 24" fill="none" stroke="#2c7a15" stroke-width="1.6"/></svg>`;

// Leaves, the toucan's branch, and which toucan is on screen.
function renderChallenge() {
  const total = rules().leaves;
  $("leaves").hidden = state.relaxed;
  $("leaves").style.display = state.relaxed ? "none" : "";
  $("leaves").innerHTML = LEAF_SVG.repeat(total);
  [...$("leaves").children].forEach((leaf, i) => leaf.classList.toggle("lost", i >= state.leaves));
  const racing = !state.relaxed && !!rules().seconds;
  $("track").classList.toggle("off", !racing);
  $("toucan").style.display = racing ? "none" : "";
}

function loseLeaf() {
  if (state.relaxed) return;
  state.leaves--;
  const leaf = $("leaves").children[state.leaves];
  if (leaf) leaf.classList.add("fall");
  Sound.play("leaf");
}

function resetToucan() {
  $("runnerPose").src = "img/toucan_hop.webp";
  $("runner").style.transition = "none";
  $("runner").style.transform = "none";
  void $("runner").offsetWidth;
  $("runner").style.transition = "";
  $("trackBanana").classList.remove("gone");
}

let timer = null;

function stopTimer() {
  if (timer) clearInterval(timer.id);
  const fraction = timer ? timer.fraction : 0;
  timer = null;
  return fraction;
}

// The toucan hops toward the banana. Only unpaused time counts.
function startTimer(r) {
  const seconds = rules().seconds;
  if (state.relaxed || !seconds) return;
  const total = (seconds + (r.eased ? EASED_EXTRA_SECONDS : 0)) * 1000;
  let elapsed = 0, prev = performance.now(), hop = 0;
  const id = setInterval(() => {
    const now = performance.now();
    if (!state.paused) elapsed += now - prev;
    prev = now;
    timer.fraction = elapsed / total;
    const reached = Math.min(TOUCAN_HOPS, Math.floor(timer.fraction * TOUCAN_HOPS));
    if (reached <= hop) return;
    hop = reached;
    $("runner").style.transform = `translateX(${hop / TOUCAN_HOPS * TOUCAN_ROAD}px)`;
    $("runnerPose").animate([{ transform: "none" }, { transform: "translateY(-30px)" }, { transform: "none" }], 320);
    Sound.play("toucanHop");
    if (hop === TOUCAN_HOPS) timeUp(r);
  }, 100);
  timer = { id, fraction: 0 };
}

function noteMiss(r) {
  if (r.missed) return;
  r.missed = true;
  state.retry.push({ a: r.a, b: r.b, due: state.roundNo + randInt(3, 4) });
  if (++state.wrongStreak >= CONFIG.wrongInARowToEase) {
    state.wrongStreak = 0;
    state.easyLeft = CONFIG.easyRounds;
  }
}

// The toucan reaches the banana: same as a miss, with a snack.
async function timeUp(r) {
  stopTimer();
  state.busy = true;
  noteMiss(r);
  $("runnerPose").src = "img/toucan_eat.webp";
  $("trackBanana").classList.add("gone");
  Sound.play("toucanMunch");
  loseLeaf();
  await revealAndMoveOn(r);
}

function napTime() {
  $("monkey").style.visibility = "hidden";
  $("pack").innerHTML = "";
  $("nap").hidden = false;
  Sound.play("yawn");
}

function setProblem(a, b, result) {
  $("problem").className = a + b + (result ?? 0) > 9 && (a > 9 || b > 9) ? "big" : "";
  $("problem").innerHTML = `<span>${a}</span><span>+</span><span>${b}</span><span>=</span>` +
    (result === undefined ? "<span>?</span>" : `<span class="answer">${result}</span>`);
}

function setMonkey(mood) {
  const m = $("monkey");
  m.src = { think: "img/monkey_think.webp", oops: "img/monkey_oops.webp", happy: "img/monkey_happy.webp" }[mood];
  m.className = mood === "think" ? "" : mood;
}

// One side of the problem: a crate for each ten, a basket for the rest.
function fillSide(el, n, fruit) {
  const tens = Math.floor(n / 10), ones = n % 10;
  const streaks = [12, 30, 48, 66].map((t) => `<i class="streak" style="top:${t}%"></i>`).join("");
  const crates = tens ? `<div class="crates">${'<img class="crate" src="img/crate_full.webp" alt="">'.repeat(tens)}</div>` : "";
  const fruits = FRUIT_LAYOUT[ones].map(([x, y]) =>
    `<img class="fruit" src="img/${fruit}.webp" alt="" style="left:${x}%;top:${y}%">`).join("");
  const bin = ones || !tens
    ? `<div class="bin${ones > 6 ? " dense" : ""}"><img class="layer" src="img/basket_back.webp" alt="">` +
      `<div class="fruits">${fruits}</div><img class="layer" src="img/basket_front.webp" alt=""></div>`
    : "";
  el.className = `basket${tens ? " has-crates" : ""}`;
  el.innerHTML = streaks + crates + bin;
  el.setAttribute("aria-label", `${tens} crates and ${ones} oranges`);
}

function showTiles(options) {
  const box = $("tiles");
  box.innerHTML = "";
  options.forEach((n, i) => {
    const b = document.createElement("button");
    b.className = "tile";
    b.style.animationDelay = `${i * 90}ms`;
    b.innerHTML = `<img src="img/tile_${i + 1}.webp" alt=""><span>${n}</span>`;
    b.addEventListener("click", () => choose(n, b));
    box.append(b);
  });
}

const sideItems = (selector) => [...$("basketL").querySelectorAll(selector), ...$("basketR").querySelectorAll(selector)];

function bounce(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

function popItem(el, step) {
  bounce(el);
  Sound.play("pop", { rate: 2 ** (Math.min(step, 18) * 1.5 / 12) });
}

// An element's box in stage coordinates, whatever the screen size.
function stageBox(el) {
  const stage = $("stage").getBoundingClientRect();
  const scale = stage.width / 1448;
  const r = el.getBoundingClientRect();
  return { x: (r.left - stage.left) / scale, y: (r.top - stage.top) / scale, w: r.width / scale, h: r.height / scale };
}

// Ten oranges hop into an empty crate, the lid thuds shut, and it opens to show them.
async function packCrate(sources) {
  const packer = document.createElement("div");
  packer.className = "packer";
  packer.innerHTML = `<img class="box" src="img/crate_empty.webp" alt=""><img class="lid" src="img/crate_lid.webp" alt="">`;
  $("pack").append(packer);
  packer.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.3,1.6,.5,1)" });
  await wait(280);

  const crate = stageBox(packer);
  const clones = [];
  for (let i = 0; i < sources.length; i++) {
    const from = stageBox(sources[i]);
    const size = crate.w * 0.17;
    const to = {
      x: crate.x + crate.w * (0.13 + (i % 5) * 0.135) + (i < 5 ? 0.012 * crate.w : 0),
      y: crate.y + crate.h * (i < 5 ? 0.1 : 0.33),
    };
    const c = document.createElement("img");
    c.className = "packFruit";
    c.src = sources[i].src;
    c.alt = "";
    Object.assign(c.style, { left: `${to.x}px`, top: `${to.y}px`, width: `${size}px` });
    sources[i].style.visibility = "hidden";
    $("pack").append(c);
    clones.push(c);
    const dx = from.x - to.x, dy = from.y - to.y, s = from.w / size;
    c.animate([
      { transform: `translate(${dx}px,${dy}px) scale(${s})` },
      { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 90}px) scale(${(s + 1) / 2})`, offset: 0.55 },
      { transform: "none" },
    ], { duration: 300, easing: "ease-in-out" });
    Sound.play("pop", { rate: 2 ** (i * 1.5 / 12) });
    await wait(165);
  }
  await wait(260);
  clones.forEach((c) => c.remove());
  packer.querySelector(".box").src = "img/crate_full.webp";

  const lid = packer.querySelector(".lid");
  const closed = { transform: "translateY(-8%)", opacity: 1 };
  lid.animate([{ transform: "translateY(-150px)", opacity: 0 }, closed],
    { duration: 300, easing: "ease-in", fill: "forwards" });
  await wait(300);
  Sound.play("crateThud");
  packer.animate([{ transform: "scale(1)" }, { transform: "scale(1.07,.93)" }, { transform: "scale(1)" }], 240);
  await wait(560);
  lid.animate([closed, { transform: "translateY(-150px)", opacity: 0 }],
    { duration: 300, easing: "ease-out", fill: "forwards" });
  await wait(320);
  return packer;
}

// The first time crates appear: show ten oranges becoming one crate.
async function crateIntro() {
  $("basketL").innerHTML = $("basketR").innerHTML = "";
  $("tiles").innerHTML = "";
  $("problem").className = "note";
  $("problem").textContent = "10 = 1 crate";
  const fruits = [];
  for (let i = 0; i < 10; i++) {
    const f = document.createElement("img");
    f.className = "packFruit";
    f.src = "img/fruit_orange.webp";
    f.alt = "";
    Object.assign(f.style, { left: `${290 + (i % 5) * 180}px`, top: `${i < 5 ? 470 : 590}px`, width: "90px" });
    $("pack").append(f);
    f.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 240, delay: i * 60, fill: "backwards", easing: "cubic-bezier(.3,1.6,.5,1)" });
    fruits.push(f);
  }
  await wait(1100);
  await packCrate(fruits);
  await wait(1000);
  $("pack").innerHTML = "";
}

async function startRound() {
  state.busy = true;
  $("rays").classList.remove("on");
  $("check").classList.remove("show");
  $("tiles").innerHTML = "";
  $("pack").innerHTML = "";
  setMonkey("think");
  resetToucan();
  if (state.level === CONFIG.cratesFromLevel && !state.introShown && !fastMode) {
    state.introShown = true;
    await crateIntro();
  }

  const r = state.round = pickRound();
  const fruit = pick(CONFIG.fruits);
  setProblem(r.a, r.b);
  fillSide($("basketL"), r.a, fruit);
  fillSide($("basketR"), r.b, fruit);
  void $("stage").offsetWidth;
  $("basketL").classList.add("fly");
  $("basketR").classList.add("fly");
  Sound.play("whoosh");
  await quick(980);
  for (const id of ["basketL", "basketR"]) { $(id).classList.remove("fly"); $(id).classList.add("landed"); }

  const items = [...sideItems(".crate"), ...sideItems(".fruit")];
  const gap = items.length > 10 ? 90 : 170;
  for (let i = 0; i < items.length; i++) { popItem(items[i], i); await quick(gap); }
  Sound.say([`n${r.a}`, "plus", `n${r.b}`]);
  showTiles(r.options);
  await quick(300);
  state.busy = false;
  startTimer(r);
}

function bubble(el, value) {
  const box = stageBox(el);
  const b = document.createElement("div");
  b.className = "bubble";
  b.textContent = value;
  b.style.left = `${box.x + box.w / 2}px`;
  b.style.top = `${box.y + 14}px`;
  $("fx").append(b);
  b.addEventListener("animationend", () => b.remove());
}

async function packFromBaskets(r) {
  r.packed = true;
  return packCrate(sideItems(".fruit").slice(0, 10));
}

// Count every orange while the answer shows. Capped so big sums don't hold up the game.
async function countHint() {
  const items = [...sideItems(".crate"), ...sideItems(".fruit")];
  const gap = Math.min(240, 2400 / Math.max(items.length, 1));
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].classList.contains("crate") ? 10 : 1;
    popItem(items[i], i);
    bubble(items[i], total);
    await quick(gap);
  }
}

// After a miss or a timeout: show the right answer, then go to the next question or a nap.
async function revealAndMoveOn(r) {
  setMonkey("oops");
  setProblem(r.a, r.b, r.answer);
  for (const t of $("tiles").children) {
    if (Number(t.querySelector("span").textContent) === r.answer) t.classList.add("right");
    else if (!t.classList.contains("wrong")) t.classList.add("gone");
  }
  const started = performance.now();
  await countHint();
  await quick(Math.max(600, 1800 - (performance.now() - started)));
  if (!state.relaxed && state.leaves <= 0) return napTime();
  for (const id of ["basketL", "basketR"]) { $(id).classList.remove("landed"); $(id).classList.add("leave"); }
  await quick(450);
  startRound();
}

async function choose(n, tile) {
  if (state.busy || state.paused) return;
  state.busy = true;
  const r = state.round;
  const raced = stopTimer();
  Sound.play("tap");
  if (n === r.answer) {
    // Answered just in time: the toucan misses its snack.
    if (raced >= 0.6) {
      $("runnerPose").src = "img/toucan_wow.webp";
      Sound.play("toucanMiss");
    }
    return correct(tile);
  }

  tile.classList.add("wrong");
  tile.disabled = true;
  Sound.play("tryAgain");
  Sound.play("monkeyHmm");
  Sound.say(["tryAgainVo"]);
  noteMiss(r);
  loseLeaf();
  await revealAndMoveOn(r);
}

function burst(x, y, count) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "spark";
    s.style.left = `${x + randInt(-260, 260)}px`;
    s.style.top = `${y + randInt(-220, 220)}px`;
    s.style.animationDelay = `${i * 70}ms`;
    $("fx").append(s);
    s.addEventListener("animationend", () => s.remove());
  }
}

function flyBanana() {
  const b = document.createElement("img");
  b.className = "flyBanana";
  b.src = "img/banana.webp";
  b.alt = "";
  $("fx").append(b);
  const anim = b.animate([
    { transform: "translate(860px,500px) scale(1) rotate(0)" },
    { transform: "translate(640px,180px) scale(1.25) rotate(-120deg)", offset: 0.45 },
    { transform: "translate(70px,20px) scale(.35) rotate(-340deg)" },
  ], { duration: fastMode ? 140 : 950, easing: "cubic-bezier(.4,0,.5,1)" });
  anim.finished.catch(() => {}).then(() => {
    b.remove();
    state.bananas++;
    renderHud();
    bounceClass($("score"), "bump");
    bounceClass($("plus"), "show");
    Sound.play("banana");
    saveProgress();
  });
}

function bounceClass(el, name) {
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
}

async function correct(tile) {
  const r = state.round;
  tile.classList.add("right");
  setProblem(r.a, r.b, r.answer);
  $("check").classList.add("show");
  Sound.play("correct");
  Sound.play("monkeyHappy");
  Sound.say(["greatJob"]);
  [...$("tiles").children].forEach((t) => { if (t !== tile) t.classList.add("gone"); });
  if (!r.missed) state.wrongStreak = 0;
  await quick(280);
  tile.classList.add("gone");
  // Show why the answer is right: the loose oranges make a new crate.
  if (makesCrate(r.a, r.b) && !r.packed) await packFromBaskets(r);

  setMonkey("happy");
  $("rays").classList.add("on");
  burst(724, 620, 8);
  await quick(650);
  flyBanana();
  await quick(1000);
  // The bar only moves forward, and only for first-try answers.
  if (!r.missed) state.progress++;
  renderHud();
  saveProgress();
  await quick(1250);

  for (const id of ["basketL", "basketR"]) { $(id).classList.remove("landed"); $(id).classList.add("leave"); }
  await quick(450);
  if (state.progress >= CONFIG.firstTryToFinishLevel) return levelComplete();
  startRound();
}

function levelComplete() {
  $("rays").classList.remove("on");
  $("pack").innerHTML = "";
  setMonkey("think");
  $("monkey").style.visibility = "hidden";
  $("levelText").textContent = `Level ${state.level} done!`;
  $("levelup").hidden = false;
  Sound.play("levelUp");
  Sound.play("monkeyHappy");
  for (let i = 0; i < 26; i++) {
    const b = document.createElement("img");
    b.className = "rain";
    b.src = "img/banana.webp";
    b.alt = "";
    b.style.left = `${randInt(0, 1400)}px`;
    b.style.animationDuration = `${randInt(18, 34) / 10}s`;
    b.style.animationDelay = `${randInt(0, 16) / 10}s`;
    $("levelup").append(b);
    b.addEventListener("animationend", () => b.remove());
  }
}

function setPaused(on) {
  state.paused = on;
  $("paused").hidden = !on;
  document.getAnimations().forEach((a) => {
    if (a.effect?.target?.closest?.("#paused")) return;
    if (on && a.playState === "running") a.pause();
    else if (!on && a.playState === "paused") a.play();
  });
  on ? Sound.suspend() : Sound.resume();
}

function renderToggles() {
  const label = (bus, name) => `${name}: ${Sound.settings[bus] ? "on" : "off"}`;
  $("toggleMusic").textContent = label("music", "Music");
  $("toggleSfx").textContent = label("sfx", "Sounds");
  $("toggleVoice").textContent = label("voice", "Voice");
  $("toggleRelaxed").textContent = `Relaxed mode: ${state.relaxed ? "on" : "off"}`;
  $("toggleFast").textContent = `Fast mode: ${fastMode ? "on" : "off"}`;
}

// Back to level 1, keeping the bananas. Asks for a second tap, so a stray tap loses nothing.
function wakeUpAndRetry() {
  state.progress = state.progress >= CHECKPOINT ? CHECKPOINT : 0;
  state.levelRounds = 0;        // the two opening problems are the gentle ones
  state.easyLeft = 0;
  state.wrongStreak = 0;
  state.retry = [];
  state.leaves = rules().leaves;
  saveProgress();
  renderHud();
  renderChallenge();
  $("nap").hidden = true;
  $("monkey").style.visibility = "";
  startRound();
}

function startOver(button) {
  if (button.dataset.armed) {
    state.level = 1;
    state.progress = 0;
    saveProgress();
    location.replace(location.pathname);   // a fresh page also drops any ?level= preview
    return;
  }
  button.dataset.armed = "yes";
  button.textContent = "Sure? Tap again";
  setTimeout(() => {
    delete button.dataset.armed;
    button.textContent = "Start over";
  }, 3000);
}

function wire() {
  addEventListener("resize", fitStage);
  // Older Safari has no overflow:clip, so undo any scrolling a focused button might cause.
  $("stage").addEventListener("scroll", () => { $("stage").scrollTo(0, 0); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !$("start").hidden && !state.paused) return Sound.suspend();
    if (document.hidden && !state.paused) setPaused(true);
  });

  document.querySelectorAll(".startOver").forEach((b) => b.addEventListener("click", () => startOver(b)));
  $("play").addEventListener("click", () => {
    Sound.unlock();
    Sound.setMusic(state.level);
    Sound.play("button");
    $("start").hidden = true;
    startRound();
  });
  $("pause").addEventListener("click", () => { Sound.play("button"); setPaused(true); });
  $("resume").addEventListener("click", () => { setPaused(false); Sound.play("button"); });
  $("nextLevel").addEventListener("click", () => {
    Sound.play("button");
    state.level++;
    Sound.setMusic(state.level);
    state.progress = 0;
    state.levelRounds = 0;
    state.easyLeft = 0;
    state.retry = [];
    state.leaves = rules().leaves;
    saveProgress();
    renderHud();
    renderChallenge();
    setScene();
    $("levelup").hidden = true;
    $("monkey").style.visibility = "";
    $("levelup").querySelectorAll(".rain").forEach((b) => b.remove());
    startRound();
  });
  $("wakeUp").addEventListener("click", () => { Sound.play("toucan"); wakeUpAndRetry(); });
  $("toggleFast").addEventListener("click", () => {
    fastMode = !fastMode;
    try { localStorage.setItem("jm-fast", fastMode ? "yes" : "no"); } catch {}
    document.documentElement.classList.toggle("fast", fastMode);
    renderToggles();
  });
  $("toggleRelaxed").addEventListener("click", () => {
    state.relaxed = !state.relaxed;
    try { localStorage.setItem("jm-relaxed", state.relaxed ? "yes" : "no"); } catch {}
    if (state.relaxed) { stopTimer(); resetToucan(); }
    renderChallenge();
    renderToggles();
  });
  $("toucan").addEventListener("click", () => {
    Sound.play("toucan");
    $("toucan").animate([{ transform: "rotate(0)" }, { transform: "translateY(-30px) rotate(-6deg)" }, { transform: "rotate(0)" }], 380);
  });
  for (const [id, bus] of [["toggleMusic", "music"], ["toggleSfx", "sfx"], ["toggleVoice", "voice"]]) {
    $(id).addEventListener("click", () => { Sound.toggle(bus); Sound.resume(); renderToggles(); Sound.suspend(); });
  }
}

async function boot() {
  fitStage();
  setScene();
  renderHud();
  renderToggles();
  state.leaves = rules().leaves;
  renderChallenge();
  wire();
  Sound.preload();
  const images = ["monkey_think", "monkey_oops", "monkey_happy", "banana", "basket_back", "basket_front",
    "tile_1", "tile_2", "tile_3", "friend_jump", "bg_temple", "bg_clearing",
    "crate_full", "crate_empty", "crate_lid", "toucan_hop", "toucan_eat", "toucan_wow", "monkey_nap", "branch", ...CONFIG.fruits];
  await Promise.all(images.map((n) => new Promise((done) => {
    const i = new Image();
    i.onload = i.onerror = done;
    i.src = `img/${n}.webp`;
  })));
  const play = $("play");
  play.disabled = false;
  const midGame = state.level > 1 || state.progress > 0;
  play.textContent = midGame ? "Keep playing" : "Play";
  document.querySelector("#start .startOver").hidden = !midGame;
}

boot();
