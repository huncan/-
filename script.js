const board = document.querySelector('#board');
const timeEl = document.querySelector('#time');
const scoreEl = document.querySelector('#score');
const bestEl = document.querySelector('#best');
const messageEl = document.querySelector('#message');
const startBtn = document.querySelector('#startBtn');
const pauseBtn = document.querySelector('#pauseBtn');
const restartBtn = document.querySelector('#restartBtn');
const difficultyEl = document.querySelector('#difficulty');
const caughtEl = document.querySelector('#caught');
const missedEl = document.querySelector('#missed');
const accuracyEl = document.querySelector('#accuracy');
const timeBar = document.querySelector('#timeBar');
const results = document.querySelector('#results');
const resultStats = document.querySelector('#resultStats');
const countdown = document.querySelector('#countdown');
const celebration = document.querySelector('#celebration');
const recordBadge = document.querySelector('#recordBadge');
const soundBtn = document.querySelector('#soundBtn');

const settings = { easy: { min: 700, max: 1050 }, normal: { min: 430, max: 760 }, hard: { min: 240, max: 470 } };
const roundSeconds = timeBar.max;
const hitPoints = 10;
const comboPoints = 20;
let score = 0, caught = 0, missed = 0, appeared = 0, streak = 0, bonus = 0;
let playing = false, lastHole = -1, moleTimer, clockTimer, deadline;
let pausedAt = null, nextMoleAt, messageBeforePause;
let activeHole = null;
let countdownTimer;
let soundOn = true;
let audioContext;
let soundOutput;
let best = 0;
try {
  best = Number(localStorage.getItem('molePopBest')) || 0;
} catch {
  // Storage may be blocked when the game is opened as a local file.
}
bestEl.textContent = best;

const moleFiles = {
  normal: ['정상.png', 'normal.png'],
  hit: ['성공.png', 'hit.png'],
  miss: ['실패.png', 'miss.png'],
};
const moleAssetDirectory = 'assets/';

async function enableArtwork(filename, className) {
  const image = new Image();
  image.src = moleAssetDirectory + filename;
  try {
    await image.decode();
    document.querySelector('.game-shell').classList.add(className);
  } catch {
    // The original CSS artwork and text controls are the defaults.
  }
}

enableArtwork('배경.png', 'has-garden');
enableArtwork('두더지입구.png', 'has-holes');
enableArtwork('게임버튼3종.png', 'has-controls');

for (let i = 0; i < 9; i++) {
  const hole = document.createElement('button');
  hole.className = 'hole';
  hole.type = 'button';
  hole.setAttribute('aria-label', `${i + 1}번 구멍`);
  hole.innerHTML = '<span class="mole" aria-hidden="true"><span class="mole-emoji">🐹</span></span>';
  hole.addEventListener('click', () => hitMole(hole));
  board.appendChild(hole);
}
const holes = [...document.querySelectorAll('.hole')];

async function loadMoleImage(state, filenames) {
  const image = new Image();
  image.alt = '';
  image.draggable = false;
  image.className = `mole-image mole-image--${state}`;
  for (const filename of filenames) {
    image.src = moleAssetDirectory + filename;
    try {
      await image.decode();
    } catch {
      continue;
    }
    for (const hole of holes) {
      const mole = hole.querySelector('.mole');
      mole.appendChild(image.cloneNode());
      mole.classList.add(`has-${state}`);
    }
    return;
  }
}

for (const [state, filenames] of Object.entries(moleFiles)) {
  loadMoleImage(state, filenames);
}

function randomDelay() {
  const { min, max } = settings[difficultyEl.value];
  return Math.round(min + Math.random() * (max - min));
}

function chooseHole() {
  const available = holes.filter((_, index) => index !== lastHole);
  const hole = available[Math.floor(Math.random() * available.length)];
  lastHole = holes.indexOf(hole);
  return hole;
}

function accuracy() {
  return appeared ? `${Math.round(caught / appeared * 100)}%` : '0%';
}

function renderStats() {
  scoreEl.textContent = score;
  caughtEl.textContent = caught;
  missedEl.textContent = missed;
  accuracyEl.textContent = accuracy();
}

function enableAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio || !soundOn) return;
  try {
    if (!audioContext) {
      audioContext = new Audio();
      soundOutput = audioContext.createGain();
      soundOutput.connect(audioContext.destination);
    }
    audioContext.resume().catch(() => {});
  } catch {
    // The game remains playable if audio is unavailable.
  }
}

function playNotes(notes) {
  if (!soundOn || audioContext?.state !== 'running' || !soundOutput) return;
  notes.forEach((frequency, index) => {
    const start = audioContext.currentTime + index * .07;
    const tone = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    tone.type = 'triangle';
    tone.frequency.value = frequency;
    envelope.gain.setValueAtTime(.001, start);
    envelope.gain.exponentialRampToValueAtTime(.12, start + .012);
    envelope.gain.exponentialRampToValueAtTime(.001, start + .15);
    tone.connect(envelope).connect(soundOutput);
    tone.onended = () => {
      tone.disconnect();
      envelope.disconnect();
    };
    tone.start(start);
    tone.stop(start + .16);
  });
}

function toggleSound() {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.textContent = soundOn ? '🔊 효과음 켜짐' : '🔇 효과음 꺼짐';
  if (soundOutput) soundOutput.gain.value = soundOn ? 1 : 0;
  if (soundOn) enableAudio();
}

function showHitEffect(hole, combo) {
  const effect = document.createElement('span');
  effect.className = combo ? 'hit-effect combo-effect' : 'hit-effect';
  effect.setAttribute('aria-hidden', 'true');
  effect.style.left = `${hole.offsetLeft + hole.offsetWidth / 2}px`;
  effect.style.top = `${hole.offsetTop + hole.offsetHeight / 2}px`;
  const points = document.createElement('span');
  points.className = 'float-points';
  points.textContent = `+${hitPoints}점`;
  effect.append(points);
  if (combo) {
    const bonusLabel = document.createElement('span');
    bonusLabel.className = 'float-bonus';
    bonusLabel.textContent = `보너스 +${comboPoints}점`;
    effect.append(bonusLabel);
  }
  for (let index = 0; index < (combo ? 8 : 5); index++) {
    const star = document.createElement('span');
    star.className = 'hit-star';
    star.textContent = '✦';
    star.style.setProperty('--angle', `${index * (combo ? 45 : 72)}deg`);
    effect.append(star);
  }
  board.append(effect);
  setTimeout(() => effect.remove(), 850);
}

function celebrate(newRecord) {
  recordBadge.hidden = !newRecord;
  celebration.replaceChildren();
  results.classList.toggle('new-record', newRecord);
  for (let index = 0; index < (newRecord ? 24 : 14); index++) {
    const piece = document.createElement('span');
    piece.textContent = newRecord && index % 3 === 0 ? '★' : '▪';
    piece.style.setProperty('--x', `${5 + (index * 17) % 91}%`);
    piece.style.setProperty('--delay', `${index % 7 * 65}ms`);
    piece.style.setProperty('--color', ['#e9a016', '#ee694d', '#31965b', '#8f59c1'][index % 4]);
    celebration.append(piece);
  }
  playNotes(newRecord ? [523, 659, 784, 1047, 1319] : [523, 659, 784]);
}

function markMiss() {
  if (!activeHole) return;
  activeHole.dataset.feedback = 'miss';
  activeHole.classList.remove('up');
  activeHole = null;
  missed += 1;
  streak = 0;
}

function updateClock() {
  if (!playing || pausedAt !== null) return false;
  const remaining = Math.max(0, (deadline - performance.now()) / 1000);
  timeEl.textContent = Math.ceil(remaining);
  timeBar.value = remaining;
  if (remaining > 0) return true;
  endGame();
  return false;
}

function popMole() {
  if (!updateClock()) return;
  markMiss();
  activeHole = chooseHole();
  delete activeHole.dataset.feedback;
  activeHole.classList.add('up');
  appeared += 1;
  renderStats();
  scheduleMole(randomDelay());
}

function scheduleMole(delay) {
  nextMoleAt = performance.now() + delay;
  moleTimer = setTimeout(popMole, delay);
}

function setPaused(at) {
  pausedAt = at;
  board.classList.toggle('paused', at !== null);
  pauseBtn.textContent = at === null ? '일시정지' : '계속하기';
  pauseBtn.setAttribute('aria-pressed', String(at !== null));
}

function togglePause() {
  if (!playing) return;
  const now = performance.now();
  if (pausedAt !== null) {
    const pauseDuration = now - pausedAt;
    deadline += pauseDuration;
    scheduleMole(Math.max(0, nextMoleAt + pauseDuration - now));
    setPaused(null);
    messageEl.textContent = messageBeforePause;
    clockTimer = setInterval(updateClock, 50);
    return;
  }
  if (!updateClock()) return;
  clearInterval(clockTimer);
  clearTimeout(moleTimer);
  messageBeforePause = messageEl.textContent;
  setPaused(now);
  messageEl.textContent = '일시정지 · 계속하기를 눌러 이어서 플레이하세요.';
}

function hitMole(hole) {
  if (!updateClock() || hole !== activeHole) return;
  activeHole = null;
  hole.dataset.feedback = 'hit';
  hole.classList.remove('up');
  setTimeout(() => {
    if (hole.dataset.feedback === 'hit') delete hole.dataset.feedback;
  }, 360);
  caught += 1;
  score += hitPoints;
  streak += 1;
  const combo = streak % 3 === 0;
  if (combo) {
    bonus += comboPoints;
    score += comboPoints;
    messageEl.textContent = `${streak}연속 성공! 보너스 +${comboPoints}점 🎉`;
  } else {
    messageEl.textContent = `잡았다! ${streak}연속 성공 🎯`;
  }
  renderStats();
  showHitEffect(hole, combo);
  playNotes(combo ? [659, 880, 1047, 1319] : [659, 988]);
}

function startGame() {
  enableAudio();
  clearTimeout(countdownTimer);
  clearTimeout(moleTimer);
  clearInterval(clockTimer);
  playing = false;
  setPaused(null);
  score = caught = missed = appeared = streak = bonus = 0;
  activeHole = null;
  lastHole = -1;
  holes.forEach(hole => {
    hole.classList.remove('up');
    delete hole.dataset.feedback;
  });
  board.querySelectorAll('.hit-effect').forEach(effect => effect.remove());
  timeEl.textContent = roundSeconds;
  timeBar.value = roundSeconds;
  renderStats();
  startBtn.disabled = true;
  pauseBtn.disabled = true;
  restartBtn.disabled = false;
  difficultyEl.disabled = true;
  countdown.hidden = false;
  showCountdown(3);
}

function showCountdown(number) {
  countdown.textContent = number;
  messageEl.textContent = `${number}초 후 시작!`;
  countdownTimer = setTimeout(() => {
    if (number > 1) {
      showCountdown(number - 1);
      return;
    }
    countdown.hidden = true;
    messageEl.textContent = '두더지를 클릭하세요!';
    pauseBtn.disabled = false;
    playing = true;
    deadline = performance.now() + roundSeconds * 1000;
    popMole();
    clockTimer = setInterval(updateClock, 50);
  }, 1000);
}

function endGame() {
  playing = false;
  clearTimeout(moleTimer);
  clearInterval(clockTimer);
  markMiss();
  renderStats();

  const newRecord = score > best;
  if (newRecord) {
    best = score;
    bestEl.textContent = best;
    try {
      localStorage.setItem('molePopBest', best);
    } catch {
      // Keep the record for the current page even if storage is unavailable.
    }
    messageEl.textContent = `새 최고 기록! ${score}점 🏆`;
  } else {
    messageEl.textContent = `게임 끝! 최종 점수는 ${score}점이에요.`;
  }
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  startBtn.textContent = '한 번 더';
  restartBtn.disabled = true;
  difficultyEl.disabled = false;

  const summary = [
    ['최종 점수', `${score}점`],
    ['잡은 두더지', `${caught}마리`],
    ['놓친 두더지', `${missed}마리`],
    ['전체 등장', `${appeared}마리`],
    ['명중률', accuracy()],
    ['보너스 점수', `${bonus}점`],
    ['최고 점수', `${best}점`],
  ];
  resultStats.replaceChildren();
  for (const [label, value] of summary) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    resultStats.append(term, detail);
  }
  results.showModal();
  celebrate(newRecord);
}

renderStats();
results.addEventListener('close', () => startBtn.focus());
startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
restartBtn.addEventListener('click', startGame);
soundBtn.addEventListener('click', toggleSound);

