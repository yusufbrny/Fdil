// ===== STATE =====
let currentUnit = null;
let currentCards = [];
let cardIndex = 0;
let known = [], unknown = [];
let mcScore = 0, mcTotal = 0;
let fibScore = 0, fibTotal = 0;
let fibMode = 'type';
let selectedFibChoice = null;
let errorBox = JSON.parse(localStorage.getItem('ydt_errors') || '{}');

// progressRaw -> { "1": ["abandon", "absolutely"], "2": [...] }
let progressRaw = JSON.parse(localStorage.getItem('ydt_progress2') || '{}');
let customVocab = JSON.parse(localStorage.getItem('ydt_vocab') || '[]');
let mixQuizCards = [];
let mixIndex = 0, mixScore = 0, mixTotal = 0;
let searchDebounceTimer = null;

// PWA Install Prompt
let deferredPrompt = null;
let pwaInstallable = false;

// SR State
let _srData = JSON.parse(localStorage.getItem('ydt_sr_v1') || '{}');

// General English State
let generalWords = [];
let generalIndex = 0;
let generalScore = 0;
let generalTotal = 0;
let generalLoading = false;
let generalPage = 0;
const generalPageSize = 30;
const generalCache = JSON.parse(localStorage.getItem('ydt_general_cache') || '{}');

// ===== PROGRESS HELPERS =====
function getLearnedSet(unit) {
  return new Set(progressRaw[unit] || []);
}
function markLearned(unit, word) {
  if (!progressRaw[unit]) progressRaw[unit] = [];
  const s = new Set(progressRaw[unit]);
  s.add(word);
  progressRaw[unit] = [...s];
  saveProgress();
  logActivity();
}
function markUnlearned(unit, word) {
  if (!progressRaw[unit]) return;
  progressRaw[unit] = progressRaw[unit].filter(w => w !== word);
  saveProgress();
}
function getProgressPct(unit) {
  const learned = getLearnedSet(unit).size;
  const total = UNITS[unit].words.length;
  return Math.round((learned / total) * 100);
}
function saveErrors() { localStorage.setItem('ydt_errors', JSON.stringify(errorBox)); updateErrorBadge(); }
function saveProgress() { localStorage.setItem('ydt_progress2', JSON.stringify(progressRaw)); }
function saveVocab() { localStorage.setItem('ydt_vocab', JSON.stringify(customVocab)); updateMyWordsBadge(); }

function updateMyWordsBadge() {
  const badge = document.getElementById('my-words-count-badge');
  if (badge) {
    if (customVocab.length > 0) {
      badge.textContent = customVocab.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

// ===== CUSTOM WORD - KELİME EKLE =====
let editingWordIndex = null;

function showAddWord(editIdx) {
  editingWordIndex = (editIdx !== undefined && editIdx !== null) ? editIdx : null;
  const isEdit = editingWordIndex !== null;
  const existing = isEdit ? customVocab[editingWordIndex] : null;
  const s = document.getElementById('screen-mywords');
  showScreen('screen-mywords');

  const initMeanings = existing && existing.meanings && existing.meanings.length > 0
    ? existing.meanings : [''];

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="showMyWords()">←</button>
      <div>
        <div class="unit-title-h">${isEdit ? '✏️ Kelimeyi Düzenle' : '➕ Yeni Kelime Ekle'}</div>
        <div class="unit-sub">Birden fazla anlam ekleyebilirsin</div>
      </div>
    </div>
    <div class="add-word-wrap">
      <div class="add-word-field">
        <div class="add-word-label">İngilizce Kelime</div>
        <input class="add-word-input" id="aw-word" placeholder="örn: perseverance" value="${esc(existing ? existing.word : '')}" autocomplete="off" autocapitalize="none" spellcheck="false">
      </div>
      <div class="add-word-field">
        <div class="add-word-label">Türkçe Anlamlar</div>
        <div class="meanings-list" id="meanings-list">
          ${initMeanings.map((m, i) => `
            <div class="meaning-row" id="mrow-${i}">
              <span class="meaning-num">${i + 1}.</span>
              <input class="add-word-input" placeholder="anlam ${i + 1}" value="${esc(m)}" id="m-${i}" autocomplete="off">
              ${initMeanings.length > 1 ? `<button class="remove-meaning-btn" onclick="removeMeaning(${i})">−</button>` : ''}
            </div>
          `).join('')}
        </div>
        <button class="add-meaning-btn" onclick="addMeaning()">+ Başka Bir Anlam Ekle</button>
      </div>
      <div class="add-word-field">
        <div class="add-word-label">Örnek Cümle <span style="color:var(--text3);font-weight:400;text-transform:none;font-size:11px">(isteğe bağlı)</span></div>
        <input class="add-word-input" id="aw-example" placeholder="örn: Her perseverance paid off." value="${esc(existing ? (existing.example || '') : '')}" autocomplete="off" spellcheck="false">
      </div>
      <button class="save-word-btn" onclick="saveCustomWord()">${isEdit ? '💾 Değişiklikleri Kaydet' : '✓ Kelimeyi Kaydet'}</button>
      ${isEdit ? `<button style="background:transparent;border:1.5px solid var(--error);color:var(--error);border-radius:14px;padding:14px;font-size:14px;font-weight:700;width:100%;margin-top:0;cursor:pointer" onclick="deleteCustomWord(${editingWordIndex})">🗑️ Bu Kelimeyi Sil</button>` : ''}
    </div>
  `;
}

function addMeaning() {
  const list = document.getElementById('meanings-list');
  if (!list) return;
  const rows = list.querySelectorAll('.meaning-row');
  const count = rows.length;
  if (count >= 8) { showToast('En fazla 8 anlam ekleyebilirsin!'); return; }
  const vals = [...rows].map(r => r.querySelector('input').value);
  vals.push('');
  list.innerHTML = vals.map((v, i) => `
    <div class="meaning-row" id="mrow-${i}">
      <span class="meaning-num">${i + 1}.</span>
      <input class="add-word-input" placeholder="anlam ${i + 1}" value="${esc(v)}" id="m-${i}" autocomplete="off">
      <button class="remove-meaning-btn" onclick="removeMeaning(${i})">−</button>
    </div>
  `).join('');
  const newInp = document.getElementById('m-' + count);
  if (newInp) newInp.focus();
}

function removeMeaning(idx) {
  const list = document.getElementById('meanings-list');
  const rows = list.querySelectorAll('.meaning-row');
  if (rows.length <= 1) { showToast('En az bir anlam olmalı!'); return; }
  const vals = [...rows].map(r => r.querySelector('input').value);
  vals.splice(idx, 1);
  list.innerHTML = vals.map((v, i) => `
    <div class="meaning-row" id="mrow-${i}">
      <span class="meaning-num">${i + 1}.</span>
      <input class="add-word-input" placeholder="anlam ${i + 1}" value="${esc(v)}" id="m-${i}" autocomplete="off">
      ${vals.length > 1 ? `<button class="remove-meaning-btn" onclick="removeMeaning(${i})">−</button>` : ''}
    </div>
  `).join('');
}

function saveCustomWord() {
  const wordInput = document.getElementById('aw-word');
  const exampleInput = document.getElementById('aw-example');
  const list = document.getElementById('meanings-list');
  const word = wordInput ? wordInput.value.trim() : '';
  const example = exampleInput ? exampleInput.value.trim() : '';
  const meanings = list ? [...list.querySelectorAll('input')].map(i => i.value.trim()).filter(v => v.length > 0) : [];

  if (!word) { showToast('⚠ İngilizce kelimeyi boş bırakamazsın!'); if (wordInput) wordInput.focus(); return; }
  if (meanings.length === 0) { showToast('⚠ En az bir anlam girmelisin!'); return; }

  if (editingWordIndex === null) {
    const exists = customVocab.find(w => w.word.toLowerCase() === word.toLowerCase());
    if (exists) { showToast('Bu kelime zaten listende var!'); return; }
    customVocab.push({ word, meanings, example });
    showToast('✓ "' + word + '" eklendi!');
  } else {
    customVocab[editingWordIndex] = { word, meanings, example };
    showToast('✓ Kelime güncellendi!');
  }

  saveVocab();
  editingWordIndex = null;
  showMyWords();
}

function deleteCustomWord(idx) {
  const w = customVocab[idx] ? customVocab[idx].word : '';
  if (!confirm('"' + w + '" silinsin mi?')) return;
  customVocab.splice(idx, 1);
  saveVocab();
  showToast('Kelime silindi.');
  showMyWords();
}

// ===== MY WORDS LIST =====
function showMyWords() {
  const s = document.getElementById('screen-mywords');
  showScreen('screen-mywords');
  renderMyWords(s);
}

function renderMyWords(s) {
  s = s || document.getElementById('screen-mywords');
  const count = customVocab.length;

  if (count === 0) {
    s.innerHTML = `
      <div class="unit-header">
        <button class="back-btn" onclick="goHome()">←</button>
        <div><div class="unit-title-h">📝 Kişisel Kelimelerim</div></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center">
        <div style="font-size:56px">📭</div>
        <div style="font-size:18px;font-weight:700;color:var(--text)">Henüz kelime eklenmemiş</div>
        <div style="font-size:14px;color:var(--text3)">Bilmediğin kelimeleri birden fazla anlamıyla ekle</div>
        <button class="save-word-btn" style="max-width:280px" onclick="showAddWord()">➕ İlk Kelimeyi Ekle</button>
      </div>`;
    return;
  }

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="goHome()">←</button>
      <div>
        <div class="unit-title-h">📝 Kişisel Kelimelerim</div>
        <div class="unit-sub">${count} kelime</div>
      </div>
      <button class="header-btn" onclick="showAddWord()" style="font-size:18px;padding:6px 10px">➕</button>
    </div>
    <div class="learn-wrap">
      <div style="display:flex;gap:10px;margin-bottom:4px;flex-shrink:0">
        <button class="result-btn" style="padding:10px 14px;font-size:13px;flex:1" onclick="startMyWordsFlash()">🃏 Flash</button>
        <button class="result-btn outline" style="padding:10px 14px;font-size:13px;flex:1" onclick="startMyWordsMC()">✅ Test</button>
      </div>
      <div class="learn-list">
        ${customVocab.map((entry, i) => `
          <div class="learn-item" style="cursor:default">
            <div class="learn-item-header">
              <div class="learn-word" style="color:var(--accent)">${esc(entry.word)}</div>
              <button onclick="showAddWord(${i})" style="background:transparent;border:1px solid var(--border);color:var(--text3);border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer">✏️ Düzenle</button>
            </div>
            <div class="learn-meanings" style="margin-top:4px">
              ${entry.meanings.length === 1
      ? '<span style="color:var(--text2)">' + esc(entry.meanings[0]) + '</span>'
      : entry.meanings.map((m, j) => '<div style="display:flex;align-items:center;gap:6px;margin-top:2px"><span style="background:var(--accent);color:white;border-radius:50%;width:17px;height:17px;font-size:9px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">' + (j + 1) + '</span><span style="color:var(--text2);font-size:14px">' + esc(m) + '</span></div>').join('')}
            </div>
            ${entry.example ? '<div style="font-size:12px;color:var(--text3);margin-top:6px;font-style:italic;padding-left:4px">"' + esc(entry.example) + '"</div>' : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
}

function getMyWordsAsCards() {
  return customVocab.map(e => {
    const arr = [e.word, e.meanings.join(' / '), e.example || ''];
    arr._isCustom = true;
    return arr;
  });
}

function startMyWordsFlash() {
  if (customVocab.length === 0) { showToast('Kelime yok!'); return; }
  currentCards = shuffle(getMyWordsAsCards());
  cardIndex = 0; known = []; unknown = [];
  renderFlash('showMyWords()', '📝 Kişisel Kelimelerim', () => 'Kişisel');
  showScreen('screen-flash');
}

function startMyWordsMC() {
  if (customVocab.length < 4) { showToast('Test için en az 4 kelime ekle!'); return; }
  const pool = shuffle(getMyWordsAsCards());
  startMC(pool, 'showMyWords()', '📝 Kelime Testi');
}


function updateErrorBadge() {
  const pvCount = (typeof pvErrors !== 'undefined') ? Object.keys(pvErrors).length : 0;
  const total = Object.keys(errorBox).length + pvCount;
  const badge = document.getElementById('error-badge-header');
  const cnt = document.getElementById('error-count-main');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline-block' : 'none'; }
  if (cnt) { cnt.textContent = total; cnt.style.display = total > 0 ? 'inline-block' : 'none'; }
}

// ===== NAVIGATION =====
function renderHome() {
  const grid = document.getElementById('unit-grid');
  grid.innerHTML = '';
  for (let u = 1; u <= 10; u++) {
    const pct = getProgressPct(u);
    const errs = Object.values(errorBox).filter(e => String(e.unit) === String(u)).length;
    grid.innerHTML += `
  <div class="unit-card" data-unit="${u}" onclick="openUnit(${u})" style="display:''">
    ${errs > 0 ? `<span class="ebadge">${errs} HATA</span>` : ''}
    <div class="unit-card-num">Ünite ${u}</div>
    <div class="unit-card-title">${UNITS[u].words[0][0].toUpperCase()} — ${UNITS[u].words[UNITS[u].words.length - 1][0].toUpperCase()}</div>
    <div class="unit-card-count">${UNITS[u].words.length} kelime · ${pct}% Öğrenildi</div>
    <div class="unit-card-bar"><div class="unit-card-bar-fill" style="width:${pct}%"></div></div>
  </div>`;
  }
  updateErrorBadge();
  updateMyWordsBadge();
  if (typeof _renderGoalCard === 'function') _renderGoalCard();
  if (typeof _renderHeaderBar === 'function') _renderHeaderBar();
}

function filterUnits(type, el) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const cards = document.querySelectorAll('#unit-grid .unit-card');
  cards.forEach(card => {
    const u = parseInt(card.dataset.unit, 10);
    const pct = getProgressPct(u);
    if (type === 'incomplete') card.style.display = pct < 100 ? '' : 'none';
    else if (type === 'done') card.style.display = pct === 100 ? '' : 'none';
    else card.style.display = '';
  });
}

function goHome() {
  showScreen('screen-home', 'back');
  renderHome();
}

function openUnit(u) {
  currentUnit = u;
  showScreen('screen-unit', 'forward');
  document.getElementById('unit-screen-title').textContent = `Ünite ${u}`;
  document.getElementById('unit-screen-sub').textContent = UNITS[u].words.length + ' kelime';
  const pct = getProgressPct(u);
  document.getElementById('unit-progress-bar').style.width = pct + '%';
  document.getElementById('unit-progress-txt').textContent = pct + '%';
}

function showScreen(id, direction = 'forward') {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active', 'slide-back', 'fade-in', 'exit-left', 'exit-right');
  });
  const nextEl = document.getElementById(id);
  if (nextEl) nextEl.classList.add('active');
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// XSS güvenli HTML escape — innerHTML'e yazmadan önce daima kullan
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// onclick attribute'larında kullanmak için (tek tırnakları kaçır)
function escQ(s) { return esc(s || ''); }

// ===== MODES =====
// -- Flash Cards --
function startFlash(words) {
  currentCards = words || shuffle(UNITS[currentUnit].words);
  cardIndex = 0; known = []; unknown = [];
  renderFlash();
  showScreen('screen-flash');
}

function renderFlash(backFn, titleOverride, unitTagFn) {
  const s = document.getElementById('screen-flash');
  if (cardIndex >= currentCards.length) { renderFlashResult(backFn); return; }
  const word = currentCards[cardIndex];
  const total = currentCards.length;
  const pct = Math.round((cardIndex / total) * 100);
  const backHandler = backFn ? backFn : `openUnit(currentUnit)`;
  const title = titleOverride || 'Flash Kartlar';
  const unitInfo = unitTagFn ? unitTagFn(word) : `Ünite ${currentUnit}`;
  s.innerHTML = `
  <div class="unit-header">
    <button class="back-btn" onclick="${backHandler}">←</button>
    <div><div class="unit-title-h">${title}</div><div class="unit-sub">${unitInfo} · ${cardIndex + 1}/${total}</div></div>
  </div>
  <div class="flash-wrap">
    <div class="flash-progress-row">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="flash-counter-badge">${cardIndex + 1}/${total}</span>
    </div>
    <div class="flash-card-wrap">
      <div class="flash-card" id="fc" onclick="handleFlashTap(event)">
        <div class="swipe-overlay left" id="fc-overlay-left">
          <div class="swipe-overlay-icon">✗</div>
          <div class="swipe-overlay-label">Bilmedim</div>
        </div>
        <div class="swipe-overlay right" id="fc-overlay-right">
          <div class="swipe-overlay-icon">✓</div>
          <div class="swipe-overlay-label">Bildim</div>
        </div>
        <div class="flash-face flash-front">
          <span class="flash-unit-badge">${unitInfo}</span>
          <div class="flash-tap-icon">👆</div>
          <div class="flash-hint">İngilizce</div>
          <div class="flash-word-row">
            <div class="flash-word">${esc(word[0])}</div>
            <button class="pronounce-btn" onclick="event.stopPropagation();speakWord('${escQ(word[0])}')" title="Telaffuz dinle">🔊</button>
          </div>
          ${renderWordMetaChips(word[0])}
          <div class="flash-hint-bottom">ortaya dokun — kartı çevir</div>
        </div>
        <div class="flash-face flash-back">
          <div class="flash-hint" style="color:rgba(255,255,255,0.7)">Türkçe</div>
          <div class="flash-meaning">${esc(word[1])}</div>
          ${word[2] ? `<div class="flash-example">"${esc(word[2])}"</div>` : ''}
          ${renderWordMetaChips(word[0], true)}
        </div>
      </div>
    </div>
    <button class="flash-flip-btn" onclick="event.stopPropagation();flipCard();flashTouchHandled=true;">🔄 Kartı Çevir</button>
    <div class="flash-swipe-guide">
      <div class="flash-guide-item"><div class="flash-guide-dot" style="background:var(--error)"></div><span style="color:var(--error)">← Bilmedim</span></div>
      <span style="font-size:10px;color:var(--text3)">sürükle veya bas</span>
      <div class="flash-guide-item"><span style="color:var(--success)">Bildim →</span><div class="flash-guide-dot" style="background:var(--success)"></div></div>
    </div>
    <div class="swipe-btn-row">
      <button class="swipe-btn wrong" id="btn-wrong" onclick="swipeCard('left')">✗ Bilmedim</button>
      <button class="swipe-btn right" id="btn-right" onclick="swipeCard('right')">✓ Bildim</button>
    </div>
  </div>`;
  initFlashDrag();
}

function flipCard() { const fc = document.getElementById('fc'); if (fc) fc.classList.toggle('flipped'); }

function handleFlashTap(e) {
  if (e.target.closest('.swipe-btn') || e.target.closest('button')) return;
  if (flashTouchHandled) { flashTouchHandled = false; return; }
  e.preventDefault();
  flipCard();
}

function renderWordMetaChips(word, darkBg = false) {
  const meta = getWordMetaFull(word);
  if (!meta.synonyms.length && !meta.antonyms.length && !meta.family.length) return '';
  const synColor = darkBg ? 'rgba(46,204,113,0.9)' : 'var(--success)';
  const antColor = darkBg ? 'rgba(255,107,107,0.9)' : 'var(--error)';
  const famColor = darkBg ? 'rgba(52,152,219,0.9)' : '#3498db';
  const bgColor = darkBg ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)';
  const borderColor = darkBg ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)';
  const chipStyle = `style="background:${bgColor};border:1px solid ${borderColor};border-radius:12px;padding:4px 10px;font-size:11px;font-weight:600;margin:3px 2px;display:inline-block"`;
  const labelStyle = `style="color:${darkBg?'rgba(255,255,255,0.6)':'var(--text3)'};font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px"`;
  let html = '<div style="margin-top:12px;display:flex;flex-wrap:wrap;justify-content:center;gap:4px">';
  if (meta.synonyms.length) {
    const syns = meta.synonyms.slice(0, 3).join(', ');
    html += `<div ${chipStyle}><div ${labelStyle} style="color:${synColor}">Eş</div><span style="color:${darkBg?'white':'var(--text)'}">${esc(syns)}</span></div>`;
  }
  if (meta.antonyms.length) {
    const ants = meta.antonyms.slice(0, 3).join(', ');
    html += `<div ${chipStyle}><div ${labelStyle} style="color:${antColor}">Zıt</div><span style="color:${darkBg?'white':'var(--text)'}">${esc(ants)}</span></div>`;
  }
  if (meta.family.length) {
    const fams = meta.family.slice(0, 3).join(', ');
    html += `<div ${chipStyle}><div ${labelStyle} style="color:${famColor}">Aile</div><span style="color:${darkBg?'white':'var(--text)'}">${esc(fams)}</span></div>`;
  }
  html += '</div>';
  return html;
}

// ===== TOUCH/MOUSE DRAG SWIPE =====
let flashTouchHandled = false;

function initFlashDrag() {
  const fc = document.getElementById('fc');
  if (!fc) return;

  let startX = 0, startY = 0, curX = 0;
  let isDragging = false;
  let intentLocked = false;   // 'horizontal' | 'vertical' | false
  let dragActive = false;     // gerçekten yatay sürükleme başladı mı
  const SWIPE_THRESHOLD = 80;
  // TAP_MAX: bu kadar hareket varsa flip tetiklenmez — 12px titreme payı
  const TAP_MAX = 12;
  const DRAG_START_MIN = 14;  // bu kadarı geçince yatay drag say

  function onStart(x, y) {
    startX = x; startY = y; curX = x;
    isDragging = true; intentLocked = false; dragActive = false;
    flashTouchHandled = false;
  }

  function onMove(x, y) {
    if (!isDragging) return;
    const dx = x - startX;
    const dy = y - startY;

    // Henüz niyet belirlenmemişse belirle
    if (!intentLocked) {
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (adx < 4 && ady < 4) return; // çok küçük hareket, bekle
      if (ady > adx) { intentLocked = 'vertical'; isDragging = false; return; }
      intentLocked = 'horizontal';
    }
    if (intentLocked !== 'horizontal') return;

    if (Math.abs(dx) >= DRAG_START_MIN) dragActive = true;
    if (!dragActive) return;
    curX = x;

    // Kart eğimi: max ±18°, dx ile orantılı
    const rot = Math.min(18, Math.max(-18, dx / 12));
    // 3D flip durumu koru
    const isFlipped = fc.classList.contains('flipped');
    fc.classList.add('dragging');
    fc.style.transform = `translateX(${dx}px) rotate(${rot}deg)${isFlipped ? ' rotateY(180deg)' : ''}`;

    // Overlay opacity — eşiğe yaklaştıkça belirginleşir
    const progress = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD);
    const overlayL = document.getElementById('fc-overlay-left');
    const overlayR = document.getElementById('fc-overlay-right');
    const btnW = document.getElementById('btn-wrong');
    const btnR = document.getElementById('btn-right');

    if (dx < 0) {
      if (overlayL) overlayL.style.opacity = progress;
      if (overlayR) overlayR.style.opacity = 0;
      if (btnW) { btnW.classList.add('drag-hint-left'); btnW.classList.remove('drag-hint-right'); }
      if (btnR) btnR.classList.remove('drag-hint-right');
    } else if (dx > 0) {
      if (overlayR) overlayR.style.opacity = progress;
      if (overlayL) overlayL.style.opacity = 0;
      if (btnR) { btnR.classList.add('drag-hint-right'); btnR.classList.remove('drag-hint-left'); }
      if (btnW) btnW.classList.remove('drag-hint-left');
    } else {
      if (overlayL) overlayL.style.opacity = 0;
      if (overlayR) overlayR.style.opacity = 0;
      if (btnW) btnW.classList.remove('drag-hint-left');
      if (btnR) btnR.classList.remove('drag-hint-right');
    }
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    const dx = curX - startX;
    fc.classList.remove('dragging');

    // Overlay ve buton hint temizle
    const overlayL = document.getElementById('fc-overlay-left');
    const overlayR = document.getElementById('fc-overlay-right');
    const btnW = document.getElementById('btn-wrong');
    const btnR = document.getElementById('btn-right');
    if (overlayL) overlayL.style.opacity = 0;
    if (overlayR) overlayR.style.opacity = 0;
    if (btnW) btnW.classList.remove('drag-hint-left');
    if (btnR) btnR.classList.remove('drag-hint-right');

    // tap: toplam hareket TAP_MAX'tan az ise flip yap
    if (!dragActive && Math.abs(curX - startX) < TAP_MAX) { flipCard(); flashTouchHandled = true; return; }

    if (dx < -SWIPE_THRESHOLD) {
      swipeCard('left');
    } else if (dx > SWIPE_THRESHOLD) {
      swipeCard('right');
    } else {
      // Eşiğe ulaşmadı — kartı geri yerine snap et
      const isFlipped = fc.classList.contains('flipped');
      fc.style.transition = 'transform 0.4s cubic-bezier(0.2,0.8,0.2,1)';
      fc.style.transform = isFlipped ? 'rotateY(180deg)' : '';
      setTimeout(() => { if (fc) fc.style.transition = ''; }, 400);
    }
  }

  // Touch events
  fc.addEventListener('touchstart', e => {
    const t = e.touches[0];
    onStart(t.clientX, t.clientY);
  }, { passive: true });

  fc.addEventListener('touchmove', e => {
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
    // Gerçek yatay sürükleme başladıysa scroll'u engelle
    if (dragActive) e.preventDefault();
  }, { passive: false });

  fc.addEventListener('touchend', () => onEnd());
  fc.addEventListener('touchcancel', () => {
    // İptal: state sıfırla, flip tetikleme
    if (!isDragging) return;
    isDragging = false; dragActive = false; intentLocked = false; flashTouchHandled = false;
    fc.classList.remove('dragging');
    ['fc-overlay-left', 'fc-overlay-right'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.opacity = 0;
    });
    ['btn-wrong', 'btn-right'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('drag-hint-left', 'drag-hint-right');
    });
    const isFlipped = fc.classList.contains('flipped');
    fc.style.transition = 'transform 0.4s cubic-bezier(0.2,0.8,0.2,1)';
    fc.style.transform = isFlipped ? 'rotateY(180deg)' : '';
    setTimeout(() => { if (fc) fc.style.transition = ''; }, 400);
  });

  // Mouse events (masaüstü için)
  fc.addEventListener('mousedown', e => {
    onStart(e.clientX, e.clientY);
    const moveHandler = ev => onMove(ev.clientX, ev.clientY);
    const upHandler = () => {
      onEnd();
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  });
}

function swipeCard(dir) {
  const fc = document.getElementById('fc');
  if (fc) {
    const isFlipped = fc.classList.contains('flipped');
    fc.classList.remove('dragging');
    fc.style.transition = 'transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.38s ease';
    const baseFlip = isFlipped ? ' rotateY(180deg)' : '';
    fc.style.transform = dir === 'right'
      ? `translateX(110vw) rotate(22deg)${baseFlip}`
      : `translateX(-110vw) rotate(-22deg)${baseFlip}`;
    fc.style.opacity = '0';
  }
  const word = currentCards[cardIndex];
  const unit = word._unit || currentUnit;
  if (dir === 'right') {
    known.push(word);
    markLearned(unit, word[0]);
    delete errorBox['u' + unit + '_' + word[0]];
    saveErrors();
  } else {
    unknown.push(word);
    markUnlearned(unit, word[0]);
    errorBox['u' + unit + '_' + word[0]] = { word: word[0], meaning: word[1], unit };
    saveErrors();
  }
  setTimeout(() => {
    cardIndex++;
    if (word._fromErrors) {
      if (cardIndex >= currentCards.length) renderFlashResult('showErrorBox()');
      else renderFlash('showErrorBox()', 'Hata Kumbarası', w => `Ünite ${w._unit}`);
    }
    else if (word._fromMix) renderMixFlash();
    else renderFlash();
  }, 380);
}

function renderFlashResult(backFn) {
  const s = document.getElementById('screen-flash');
  const backHandler = backFn || `openUnit(${currentUnit})`;
  s.innerHTML = `
  <div class="result-wrap">
    <div class="result-emoji">${unknown.length === 0 ? '🏆' : known.length > unknown.length ? '💪' : '📚'}</div>
    <div class="result-title">${unknown.length === 0 ? 'Mükemmel!' : 'Sonuçlar'}</div>
    <div class="result-sub">${known.length + unknown.length} kelimeden ${known.length} tanesini bildiniz</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num" style="color:var(--success)">${known.length}</div><div class="stat-lbl">Bildim ✓</div></div>
      <div class="stat-box"><div class="stat-num" style="color:var(--error)">${unknown.length}</div><div class="stat-lbl">Bilmedim ✗</div></div>
    </div>
    ${unknown.length > 0 ? `<button class="result-btn" onclick="startFlash(shuffle(unknown))">Bilemediklerimi Tekrar Et</button>` : ''}
    <button class="result-btn outline" onclick="${backHandler}">Geri Dön</button>
  </div>`;
}

// -- MC Mode --
function startMC(pool, backFn, title) {
  currentCards = pool || shuffle(UNITS[currentUnit].words);
  cardIndex = 0; mcScore = 0; mcTotal = currentCards.length;
  renderMC(backFn, title);
  showScreen('screen-mc');
}

function renderMC(backFn, titleOverride) {
  const s = document.getElementById('screen-mc');
  if (cardIndex >= currentCards.length) { renderMCResult(backFn, titleOverride); return; }
  const word = currentCards[cardIndex];
  const unit = word._unit || currentUnit;
  const allWords = UNITS[unit] ? UNITS[unit].words : Object.values(UNITS).flatMap(u => u.words);
  const wrong = shuffle(allWords.filter(w => w[0] !== word[0])).slice(0, 3);
  const opts = shuffle([word, ...wrong]);
  const pct = Math.round((cardIndex / mcTotal) * 100);
  const backHandler = backFn || `openUnit(${currentUnit})`;
  const title = titleOverride || 'Çoktan Seçmeli';
  s.innerHTML = `
  <div class="unit-header">
    <button class="back-btn" onclick="${backHandler}">←</button>
    <div><div class="unit-title-h">${title}</div><div class="unit-sub">Ünite ${unit} · ${cardIndex + 1}/${mcTotal}</div></div>
  </div>
  <div class="mc-wrap">
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="mc-question">
      <div class="mc-q-label">Aşağıdaki Kelimenin Anlamı Nedir?</div>
      <div class="mc-q-word">${esc(word[0])}</div>
      ${word[2] ? `<div class="mc-q-example">${esc(word[2])}</div>` : ''}
    </div>
    <div class="mc-options">
      ${opts.map(o => `<button class="mc-opt" onclick="checkMC(this,'${escQ(o[0])}','${escQ(word[0])}','${escQ(word[1])}','${escQ(backFn || '')}','${escQ(titleOverride || '')}')">${esc(o[1])}</button>`).join('')}
    </div>
  </div>`;
}

function checkMC(btn, chosen, correct, meaning, backFn, titleOverride) {
  document.querySelectorAll('.mc-opt').forEach(b => b.classList.add('disabled'));
  const word = currentCards[cardIndex];
  const unit = word._unit || currentUnit;
  if (chosen === correct) {
    btn.classList.add('correct'); mcScore++;
    markLearned(unit, correct); delete errorBox['u' + unit + '_' + correct]; saveErrors();
    setTimeout(() => { cardIndex++; renderMC(backFn || null, titleOverride || null); }, 1000);
  } else {
    btn.classList.add('wrong');
    document.querySelectorAll('.mc-opt').forEach(b => { if (b.textContent.trim() === meaning) b.classList.add('correct'); });
    markUnlearned(unit, correct); errorBox['u' + unit + '_' + correct] = { word: correct, meaning, unit }; saveErrors();
    setTimeout(() => { cardIndex++; renderMC(backFn || null, titleOverride || null); }, 1500);
  }
}

function renderMCResult(backFn, titleOverride) {
  const u = currentUnit; const pct = Math.round((mcScore / mcTotal) * 100);
  const s = document.getElementById('screen-mc');
  const backHandler = backFn || `openUnit(${u})`;
  s.innerHTML = `
  <div class="result-wrap">
    <div class="result-emoji">${pct >= 80 ? '🎯' : pct >= 50 ? '👍' : '💡'}</div>
    <div class="result-title">${pct}% Başarı</div>
    <div class="result-sub">${mcTotal} sorudan ${mcScore} tanesi doğru</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num" style="color:var(--success)">${mcScore}</div><div class="stat-lbl">Doğru</div></div>
      <div class="stat-box"><div class="stat-num" style="color:var(--error)">${mcTotal - mcScore}</div><div class="stat-lbl">Yanlış</div></div>
    </div>
    <button class="result-btn outline" onclick="${backHandler}">Geri Dön</button>
  </div>`;
}

// -- FIB Mode (Type) --
function startFIB() {
  currentCards = shuffle(UNITS[currentUnit].words).filter(w => w[2]);
  if (currentCards.length === 0) { showToast('Bu ünitede örnek cümle yok!'); return; }
  cardIndex = 0; fibScore = 0; fibTotal = currentCards.length;
  renderFIB(); showScreen('screen-fib');
}

function renderFIB() {
  const s = document.getElementById('screen-fib');
  if (cardIndex >= fibTotal) { renderFIBResult(); return; }
  const word = currentCards[cardIndex];
  const sentence = word[2].replace(new RegExp('\\b' + word[0] + '\\b', 'i'), '<span class="fib-blank">_____</span>');
  const pct = Math.round((cardIndex / fibTotal) * 100);

  s.innerHTML = `
  <div class="unit-header">
    <button class="back-btn" onclick="openUnit(${currentUnit})">←</button>
    <div><div class="unit-title-h">Boşluk Doldur</div><div class="unit-sub">Ünite ${currentUnit} · ${cardIndex + 1}/${fibTotal}</div></div>
  </div>
  <div class="fib-wrap">
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="fib-question">
      <div class="mc-q-label">Cümleyi tamamlayacak kelimeyi yazın</div>
      <div class="fib-sentence">${sentence}</div>
      <div class="fib-hint">Türkçe İpucu: <b>${word[1]}</b></div>
    </div>
    <div class="fib-input-area">
      <div class="fib-input-row">
        <input class="fib-input" id="fib-inp" placeholder="Kelimeyi buraya yaz..." autocomplete="off" onkeydown="if(event.key==='Enter')checkFIB()">
        <button class="fib-submit" onclick="checkFIB()">Kontrol Et</button>
      </div>
      <div id="fib-feedback"></div>
      <button id="fib-next-btn" class="fib-submit" style="display:none; width:100%; background:var(--text); color:white" onclick="cardIndex++;renderFIB()">Sonraki Soru →</button>
    </div>
  </div>`;
  setTimeout(() => { const inp = document.getElementById('fib-inp'); if (inp) inp.focus(); }, 100);
}

function checkFIB() {
  const inp = document.getElementById('fib-inp'); const fb = document.getElementById('fib-feedback'); const nextBtn = document.getElementById('fib-next-btn');
  if (!inp || inp.disabled) return;
  const answer = inp.value.trim().toLowerCase();
  if (!answer) { showToast('Cevap yazmalısınız!'); return; }
  const correct = currentCards[cardIndex][0].toLowerCase();
  inp.disabled = true;
  if (answer === correct || answer === correct + 's' || correct === answer + 's' || answer === correct + 'd' || correct === answer + 'd') {
    inp.classList.add('correct'); fb.className = 'fib-feedback correct'; fb.textContent = '✓ Harika! Doğru cevap.';
    fibScore++; markLearned(currentUnit, correct); delete errorBox['u' + currentUnit + '_' + correct]; saveErrors();
    setTimeout(() => { cardIndex++; renderFIB(); }, 1200);
  } else {
    inp.classList.add('wrong'); fb.className = 'fib-feedback wrong'; fb.innerHTML = `✗ Yanlış. Doğru cevap: <b>${esc(currentCards[cardIndex][0])}</b>`;
    markUnlearned(currentUnit, correct); errorBox['u' + currentUnit + '_' + correct] = { word: currentCards[cardIndex][0], meaning: currentCards[cardIndex][1], unit: currentUnit }; saveErrors();
    nextBtn.style.display = 'block';
  }
}

function renderFIBResult() {
  const pct = Math.round((fibScore / fibTotal) * 100);
  const s = document.getElementById('screen-fib');
  s.innerHTML = `
  <div class="result-wrap">
    <div class="result-emoji">${pct >= 80 ? '✨' : pct >= 50 ? '📝' : '🔁'}</div>
    <div class="result-title">${pct}% Başarı</div>
    <div class="result-sub">Boşluk Doldurma · ${fibTotal} sorudan ${fibScore} doğru</div>
    <button class="result-btn outline" onclick="openUnit(${currentUnit})">Geri Dön</button>
  </div>`;
}

// -- Learn & Dictionary --
function startLearn() { showScreen('screen-learn'); renderLearn(''); }
function renderLearn(filter) {
  const s = document.getElementById('screen-learn');
  const words = UNITS[currentUnit].words.filter(w => w[0].toLowerCase().includes(filter.toLowerCase()) || w[1].toLowerCase().includes(filter.toLowerCase()));
  s.innerHTML = `
  <div class="unit-header">
    <button class="back-btn" onclick="openUnit(${currentUnit})">←</button>
    <div><div class="unit-title-h">Sözlük & Öğrenme</div><div class="unit-sub">Ünite ${currentUnit} · ${UNITS[currentUnit].words.length} kelime</div></div>
  </div>
  <div class="learn-wrap">
    <input class="learn-search" placeholder="İngilizce veya Türkçe ara..." oninput="debounceLearn(this.value)" value="${filter}">
    <div class="learn-list">
      ${words.length === 0 ? '<div style="color:var(--text3);text-align:center;padding:24px">Sonuç bulunamadı.</div>' :
      words.map((w, i) => `
        <div class="learn-item" id="li${i}" data-word="${escQ(w[0])}" data-meaning="${escQ(w[1])}" data-example="${escQ(w[2] || '')}" onclick="toggleLearnMeta(this)">
          <div class="learn-item-header"><div class="learn-word">${esc(w[0])}</div><span class="learn-expand">▸</span></div>
          <div class="learn-meanings">${esc(w[1])}</div>
          <div class="learn-detail"></div>
        </div>`).join('')}
    </div>
  </div>`;
}

function debounceLearn(val) { clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(() => renderLearn(val), 250); }

// toggleLearnMeta is defined below (uses getWordMetaFull with user overrides)

function switchLearnTab(e, btn, tabId) {
  e.stopPropagation();
  const tabGroup = btn.closest('.learn-detail');
  tabGroup.querySelectorAll('.wdt-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  tabGroup.querySelectorAll('.word-detail-content').forEach(c => c.style.display = 'none');
  const safeTabId = tabId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const target = tabGroup.querySelector('#tab-' + safeTabId);
  if (target) target.style.display = 'block';
}

// -- Syn Quiz --
function startSynQuiz() {
  const allWords = UNITS[currentUnit].words.filter(w => getWordMeta(w[0]).synonyms.length >= 1);
  if (allWords.length < 4) { showToast('Bu ünitede yeterli eş anlamlı verisi yok!'); return; }
  window._synCards = shuffle(allWords); window._synIdx = 0; window._synScore = 0;
  showScreen('screen-syn-quiz'); renderSynQuiz();
}
function renderSynQuiz() {
  const s = document.getElementById('screen-syn-quiz'); const cards = window._synCards;
  if (window._synIdx >= cards.length || window._synIdx >= 20) { // Max 20 soru
    const total = Math.min(cards.length, 20);
    const pct = Math.round((window._synScore / total) * 100);
    s.innerHTML = `
      <div class="result-wrap">
        <div class="result-emoji">${pct >= 80 ? '🏆' : '👍'}</div>
        <div class="result-title">${pct}% Başarı</div>
        <div class="result-sub">Eş Anlam Testi Tamamlandı</div>
        <button class="result-btn outline" onclick="openUnit(${currentUnit})">Geri Dön</button>
      </div>`;
    return;
  }
  const word = cards[window._synIdx]; const meta = getWordMeta(word[0]);
  const correctSyn = meta.synonyms[Math.floor(Math.random() * meta.synonyms.length)];

  const allPool = [];
  Object.values(UNITS).forEach(u => u.words.forEach(w => { const m = getWordMeta(w[0]); if (m && w[0] !== word[0]) allPool.push(...m.synonyms); }));
  const wrongOpts = shuffle([...new Set(allPool)].filter(x => x !== correctSyn)).slice(0, 3);
  const opts = shuffle([correctSyn, ...wrongOpts]);
  const pct = Math.round((window._synIdx / Math.min(cards.length, 20)) * 100);

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="openUnit(${currentUnit})">←</button>
      <div><div class="unit-title-h">Eş Anlam Quiz</div><div class="unit-sub">Soru ${window._synIdx + 1}</div></div>
    </div>
    <div class="mc-wrap">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="mc-question">
        <div class="mc-q-label">Bu kelimenin EŞ ANLAMLISI hangisidir?</div>
        <div class="mc-q-word" style="color:var(--accent)">${esc(word[0])}</div>
        <div style="font-size:14px;color:var(--text3);margin-top:8px">${esc(word[1])}</div>
      </div>
      <div class="mc-options">
        ${opts.map(o => `<button class="mc-opt" onclick="checkSynQuiz(this,'${escQ(o)}','${escQ(correctSyn)}')">${esc(o)}</button>`).join('')}
      </div>
    </div>`;
}
function checkSynQuiz(btn, chosen, correct) {
  document.querySelectorAll('#screen-syn-quiz .mc-opt').forEach(b => b.classList.add('disabled'));
  if (chosen === correct) {
    btn.classList.add('correct'); window._synScore++; logActivity();
    setTimeout(() => { window._synIdx++; renderSynQuiz(); }, 1000);
  } else {
    btn.classList.add('wrong');
    document.querySelectorAll('#screen-syn-quiz .mc-opt').forEach(b => { if (b.textContent.trim() === correct) b.classList.add('correct'); });
    setTimeout(() => { window._synIdx++; renderSynQuiz(); }, 1600);
  }
}

// ===== GLOBAL SEARCH =====
let globalSearchTimer = null;
let globalSearchApiCache = JSON.parse(localStorage.getItem('ydt_global_search_cache') || '{}');

function onGlobalSearch(val) {
  clearTimeout(globalSearchTimer);
  globalSearchTimer = setTimeout(() => renderGlobalSearch(val), 200);
}

async function renderGlobalSearch(val) {
  const norm = val.trim().toLowerCase();
  const normalContent = document.getElementById('home-normal-content');
  const searchContent = document.getElementById('home-search-content');
  const resultsEl = document.getElementById('search-results');

  if (!norm) {
    normalContent.style.display = '';
    searchContent.style.display = 'none';
    return;
  }
  normalContent.style.display = 'none';
  searchContent.style.display = 'flex';

  const results = [];
  for (let u = 1; u <= 10; u++) {
    UNITS[u].words.forEach(w => {
      if (w[0].toLowerCase().includes(norm) || w[1].toLowerCase().includes(norm)) {
        results.push({ word: w, unit: u, type: 'ydt' });
      }
    });
  }
  
  // Search in General English words
  const generalKeys = Object.keys(generalCache);
  generalKeys.forEach(w => {
    const data = generalCache[w];
    const def = data.definitions?.[0] || '';
    if (w.toLowerCase().includes(norm) || def.toLowerCase().includes(norm)) {
      results.push({ word: [w, def, ''], unit: '🌐', type: 'general', data: data });
    }
  });

  function highlight(text, q) {
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return esc(text);
    return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' + esc(text.slice(idx + q.length));
  }

  if (results.length === 0) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div><div style="margin-top:10px;color:var(--text3)">API'de aranıyor...</div></div>`;
    
    // Search via API
    const apiData = await fetchDictData(norm);
    if (apiData) {
      globalSearchApiCache[norm] = apiData;
      localStorage.setItem('ydt_global_search_cache', JSON.stringify(globalSearchApiCache));
      resultsEl.innerHTML = `
        <div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px">🌐 API sonucu</div>
        <div class="search-result-item" onclick="showDictWordDetail('${escQ(apiData.word)}')">
          <div>
            <div class="search-result-word">${highlight(apiData.word, norm)}</div>
            <div class="search-result-meaning">${highlight(apiData.turkish || apiData.meanings?.[0]?.definitions?.[0] || '', norm)}</div>
          </div>
          <span class="search-result-badge" style="background:rgba(46,204,113,0.15);color:#2ecc71;border-color:rgba(46,204,113,0.3)">🌐 Sözlük</span>
        </div>`;
    } else {
      resultsEl.innerHTML = `<div class="search-empty"><div class="search-empty-icon">🔍</div><div style="font-size:16px;font-weight:700;color:var(--text)">Sonuç bulunamadı</div><div style="font-size:13px;margin-top:6px">"${esc(val)}" için eşleşme yok</div></div>`;
    }
    return;
  }

  resultsEl.innerHTML = `<div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px">${results.length} sonuç bulundu</div>` +
    results.map(r => {
      if (r.type === 'general') {
        return `<div class="search-result-item" onclick="showGeneralWordDetail('${escQ(r.word[0])}')">
          <div>
            <div class="search-result-word">${highlight(r.word[0], norm)}</div>
            <div class="search-result-meaning">${highlight(r.word[1], norm)}</div>
          </div>
          <span class="search-result-badge" style="background:rgba(155,89,182,0.15);color:#9b59b6;border-color:rgba(155,89,182,0.3)">🌐 Genel</span>
        </div>`;
      }
      return `<div class="search-result-item" onclick="openWordModal('${escQ(r.word[0])}')">
        <div>
          <div class="search-result-word">${highlight(r.word[0], norm)}</div>
          <div class="search-result-meaning">${highlight(r.word[1], norm)}</div>
        </div>
        <span class="search-result-badge">Ünite ${r.unit}</span>
      </div>`;
    }).join('');
}

function showDictWordDetail(word) {
  dictSearchWord(word);
  showScreen('screen-dict');
}

// ===== WORD DETAIL MODAL =====
// (openWordModal is defined at the bottom of the script with meta edit support)

function closeWordModal() {
  const overlay = document.getElementById('word-modal-overlay');
  const modal = overlay.querySelector('.word-modal');
  if (modal) modal.classList.add('closing');
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('closing');
    if (modal) modal.classList.remove('closing');
    document.body.style.overflow = '';
  }, 220);
}

// Escape tuşu ile modal kapat
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeWordModal(); closeMetaEdit && closeMetaEdit(); } });

// ===== ZIT ANLAM QUIZ =====
function startAntQuiz() {
  const allWords = UNITS[currentUnit].words.filter(w => getWordMeta(w[0]).antonyms.length >= 1);
  if (allWords.length < 4) { showToast('Bu ünitede yeterli zıt anlamlı veri yok!'); return; }
  window._antCards = shuffle(allWords); window._antIdx = 0; window._antScore = 0;
  showScreen('screen-ant-quiz'); renderAntQuiz();
}

function renderAntQuiz() {
  const s = document.getElementById('screen-ant-quiz'); const cards = window._antCards;
  if (window._antIdx >= cards.length || window._antIdx >= 20) {
    const total = Math.min(cards.length, 20);
    const pct = Math.round((window._antScore / total) * 100);
    s.innerHTML = `
      <div class="result-wrap">
        <div class="result-emoji">${pct >= 80 ? '🏆' : '👍'}</div>
        <div class="result-title">${pct}% Başarı</div>
        <div class="result-sub">Zıt Anlam Testi Tamamlandı</div>
        <button class="result-btn outline" onclick="openUnit(${currentUnit})">Geri Dön</button>
      </div>`; return;
  }
  const word = cards[window._antIdx]; const meta = getWordMeta(word[0]);
  const correctAnt = meta.antonyms[Math.floor(Math.random() * meta.antonyms.length)];

  const allPool = [];
  Object.values(UNITS).forEach(u => u.words.forEach(w => { const m = getWordMeta(w[0]); if (m && w[0] !== word[0]) allPool.push(...m.antonyms); }));
  const wrongOpts = shuffle([...new Set(allPool)].filter(x => x !== correctAnt)).slice(0, 3);
  if (wrongOpts.length < 3) { window._antIdx++; renderAntQuiz(); return; }
  const opts = shuffle([correctAnt, ...wrongOpts]);
  const pct = Math.round((window._antIdx / Math.min(cards.length, 20)) * 100);

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="openUnit(${currentUnit})">←</button>
      <div><div class="unit-title-h">Zıt Anlam Quiz</div><div class="unit-sub">Soru ${window._antIdx + 1}</div></div>
    </div>
    <div class="mc-wrap">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="mc-question">
        <div class="ant-quiz-badge">ZIT ANLAM</div>
        <div class="mc-q-label">Bu kelimenin ZIT ANLAMLISI hangisidir?</div>
        <div class="mc-q-word" style="color:var(--error)">${esc(word[0])}</div>
        <div style="font-size:14px;color:var(--text3);margin-top:8px">${esc(word[1])}</div>
      </div>
      <div class="mc-options">
        ${opts.map(o => `<button class="mc-opt" onclick="checkAntQuiz(this,'${escQ(o)}','${escQ(correctAnt)}')">${esc(o)}</button>`).join('')}
      </div>
    </div>`;
}

function checkAntQuiz(btn, chosen, correct) {
  document.querySelectorAll('#screen-ant-quiz .mc-opt').forEach(b => b.classList.add('disabled'));
  if (chosen === correct) {
    btn.classList.add('correct'); window._antScore++; logActivity();
    setTimeout(() => { window._antIdx++; renderAntQuiz(); }, 1000);
  } else {
    btn.classList.add('wrong');
    document.querySelectorAll('#screen-ant-quiz .mc-opt').forEach(b => { if (b.textContent.trim() === correct) b.classList.add('correct'); });
    setTimeout(() => { window._antIdx++; renderAntQuiz(); }, 1600);
  }
}
function showMixQuiz() {
  let pool = [];
  for (let u = 1; u <= 10; u++) { UNITS[u].words.forEach(w => { const wc = [...w]; wc._unit = u; pool.push(wc); }); }
  startMC(shuffle(pool).slice(0, 40), 'goHome()', '🎲 Karışık Çoktan Seçmeli (40 Soru)');
}

function showErrorBox() {
  showScreen('screen-error'); const s = document.getElementById('screen-error');
  const errors = Object.values(errorBox);
  if (errors.length === 0) {
    s.innerHTML = `
    <div class="unit-header"><button class="back-btn" onclick="goHome()">←</button><div><div class="unit-title-h">🏦 Hata Kumbarası</div></div></div>
    <div style="padding:40px 20px; text-align:center; color:var(--text3)">
      <div style="font-size:48px;margin-bottom:16px">🎉</div>
      <div style="font-size:18px;font-weight:700;color:var(--text)">Hata kumbarası tertemiz!</div>
      <div style="font-size:14px;margin-top:8px">Harika gidiyorsun, tüm kelimeleri bildin.</div>
    </div>`; return;
  }
  s.innerHTML = `
  <div class="unit-header">
    <button class="back-btn" onclick="goHome()">←</button>
    <div><div class="unit-title-h">🏦 Hata Kumbarası</div><div class="unit-sub">${errors.length} kelime birikti</div></div>
  </div>
  <div class="learn-wrap">
    <div style="display:flex;gap:12px;margin-bottom:8px">
      <button class="result-btn" style="padding:12px;font-size:14px" onclick="practiceErrors()">🃏 Flash Çalış</button>
      <button class="result-btn outline" style="padding:12px;font-size:14px" onclick="practiceErrorsMC()">✅ Test Çöz</button>
    </div>
    <div class="learn-list">
      ${errors.map(e => `
        <div class="learn-item" style="display:flex;justify-content:space-between;align-items:center;cursor:default">
          <div><div style="font-weight:700;color:var(--error);font-size:15px">${esc(e.word)}</div><div style="font-size:13px;color:var(--text2)">${esc(e.meaning)}</div></div>
          <span style="font-size:11px;background:var(--bg);padding:4px 8px;border-radius:8px;color:var(--text3)">Ünite ${esc(String(e.unit))}</span>
        </div>`).join('')}
    </div>
    <button style="background:transparent;border:1px solid var(--border);color:var(--text3);padding:12px;border-radius:12px;margin-top:auto" onclick="if(confirm('Tüm hatalar silinsin mi?')){errorBox={};saveErrors();showErrorBox();}">🗑️ Kumbarayı Temizle</button>
  </div>`;
}

function practiceErrors() {
  const errs = Object.values(errorBox); if (!errs.length) return;
  currentCards = shuffle(errs.map(e => { const w = [e.word, e.meaning, '']; w._unit = e.unit; w._fromErrors = true; return w; }));
  cardIndex = 0; known = []; unknown = []; renderFlash('showErrorBox()', 'Hata Kumbarası - Flash', w => `Ünite ${w._unit}`); showScreen('screen-flash');
}
function practiceErrorsMC() {
  const errs = Object.values(errorBox); if (errs.length < 4) { showToast('Test için en az 4 kelime olmalı!'); return; }
  currentCards = shuffle(errs.map(e => { const w = [e.word, e.meaning, '']; w._unit = e.unit; return w; }));
  cardIndex = 0; mcScore = 0; mcTotal = currentCards.length; renderMC('showErrorBox()', 'Hata Kumbarası - Test'); showScreen('screen-mc');
}

// ===== STATS & UI FIXES =====
function showStats() { 
  const overlay = document.getElementById('stats-overlay');
  const panel = overlay.querySelector('.stats-panel');
  overlay.style.display = 'flex';
  if (panel) panel.classList.remove('closing');
  overlay.classList.remove('closing');
  renderStatsContent(); 
}

function closeStats() { 
  const overlay = document.getElementById('stats-overlay');
  const panel = overlay.querySelector('.stats-panel');
  if (panel) panel.classList.add('closing');
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('closing');
    if (panel) panel.classList.remove('closing');
  }, 200);
}

function renderStatsContent() {
  const totalWords = Object.values(UNITS).reduce((a, u) => a + u.words.length, 0);
  let learnedCount = 0;
  Object.values(progressRaw).forEach(arr => { learnedCount += arr.length; });
  const errCount = Object.keys(errorBox).length;
  const pvErrCount = Object.keys((typeof pvErrors !== 'undefined' ? pvErrors : null) || {}).length;
  const completePct = Math.round((learnedCount / totalWords) * 100) || 0;
  const remaining = totalWords - learnedCount;

  // Total PV count
  const totalPV = Object.values(PHRASAL_VERBS).reduce((a, arr) => a + arr.length, 0);

  // Best / worst unit
  let bestUnit = null, bestPct = -1, worstUnit = null, worstPct = 101;
  const unitStats = Object.entries(UNITS).map(([num, unit]) => {
    const learned = unit.words.filter(w => progressRaw[num] && progressRaw[num].includes(w[0])).length;
    const pct = Math.round((learned / unit.words.length) * 100);
    if (pct > bestPct) { bestPct = pct; bestUnit = num; }
    if (pct < worstPct) { worstPct = pct; worstUnit = num; }
    return { num, total: unit.words.length, learned, pct };
  });

  // SVG ring
  const circ = 2 * Math.PI * 45;
  const offset = circ - (completePct / 100) * circ;

  // Milestones
  const milestones = [
    { icon: '🌱', label: '%10', earned: completePct >= 10 },
    { icon: '🌿', label: '%25', earned: completePct >= 25 },
    { icon: '🌳', label: '%50', earned: completePct >= 50 },
    { icon: '⭐', label: '%75', earned: completePct >= 75 },
    { icon: '🏅', label: '%90', earned: completePct >= 90 },
    { icon: '🏆', label: '%100', earned: completePct >= 100 },
  ];

  const unitBarsHtml = unitStats.map(u => `
    <div class="stats-unit-row">
      <span class="stats-unit-label">Ünite ${u.num}</span>
      <div class="stats-unit-bar-wrap">
        <div class="stats-unit-bar-fill ${u.pct === 100 ? 'done' : ''}" style="width:${u.pct}%"></div>
      </div>
      <span class="stats-unit-pct">${u.pct}%</span>
      <span class="stats-unit-count">${u.learned}/${u.total}</span>
    </div>`).join('');

  const milestonesHtml = milestones.map(m => `
    <div class="stats-milestone ${m.earned ? 'earned' : ''}">
      <span class="stats-milestone-icon">${m.icon}</span>
      <span>${m.label}</span>
    </div>`).join('');

  document.getElementById('stats-content').innerHTML = `
    <!-- Hero Ring -->
    <div class="stats-hero">
      <div class="stats-ring-wrap">
        <svg class="stats-ring-svg" viewBox="0 0 100 100">
          <circle class="stats-ring-bg" cx="50" cy="50" r="45"/>
          <circle class="stats-ring-fill" cx="50" cy="50" r="45"
            stroke-dasharray="${circ.toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}"/>
        </svg>
        <div class="stats-ring-center">
          <div class="stats-ring-pct">${completePct}%</div>
          <div class="stats-ring-lbl">Başarı</div>
        </div>
      </div>
      <div class="stats-hero-sub"><b>${learnedCount}</b> öğrenildi · <b>${remaining}</b> kaldı</div>
    </div>

    <!-- 6-card grid (2x3) -->
    <div class="stats-grid">
      <div class="stats-card green">
        <div class="stats-card-icon">✅</div>
        <div class="stats-card-num" style="color:var(--success)">${learnedCount}</div>
        <div class="stats-card-label">Öğrenilen</div>
      </div>
      <div class="stats-card red">
        <div class="stats-card-icon">⚠️</div>
        <div class="stats-card-num" style="color:var(--error)">${errCount + pvErrCount}</div>
        <div class="stats-card-label">Hata Kumbarası</div>
      </div>
      <div class="stats-card blue">
        <div class="stats-card-icon">📚</div>
        <div class="stats-card-num" style="color:#3498db">${totalWords}</div>
        <div class="stats-card-label">Toplam Kelime</div>
      </div>
      <div class="stats-card accent">
        <div class="stats-card-icon">⏳</div>
        <div class="stats-card-num">${remaining}</div>
        <div class="stats-card-label">Kalan</div>
      </div>
      <div class="stats-card orange" style="grid-column: span 2">
        <div class="stats-card-icon">🔗</div>
        <div class="stats-card-num" style="color:#e67e22">${totalPV}</div>
        <div class="stats-card-label">Toplam Phrasal Verb · ${pvErrCount} hata</div>
      </div>
    </div>

    <!-- Best / Worst -->
    ${bestUnit ? `
    <div style="display:flex;gap:10px;padding:0 16px 16px">
      <div style="flex:1;background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.2);border-radius:14px;padding:14px;text-align:center">
        <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">🥇 En İyi</div>
        <div style="font-size:16px;font-weight:800;color:var(--success)">Ünite ${bestUnit}</div>
        <div style="font-size:12px;color:var(--success);font-weight:600">${bestPct}%</div>
      </div>
      <div style="flex:1;background:rgba(231,76,60,0.06);border:1px solid rgba(231,76,60,0.18);border-radius:14px;padding:14px;text-align:center">
        <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">📌 Çalışılacak</div>
        <div style="font-size:16px;font-weight:800;color:var(--error)">Ünite ${worstUnit}</div>
        <div style="font-size:12px;color:var(--error);font-weight:600">${worstPct}%</div>
      </div>
    </div>` : ''}

    <!-- Unit bars -->
    <div class="stats-section" style="border-top:1px solid var(--border);padding-top:20px">
      <div class="stats-section-title">📊 Ünite Bazlı İlerleme</div>
      ${unitBarsHtml}
    </div>

    <!-- Milestones -->
    <div class="stats-section" style="border-top:1px solid var(--border);padding-top:20px">
      <div class="stats-section-title">🏅 Başarı Rozetleri</div>
      <div class="stats-milestones">
        ${milestonesHtml}
      </div>
    </div>

    <!-- Reset -->
    <button class="stats-reset-btn" onclick="if(confirm('Tüm kelime ilerlemesi sıfırlansın mı? Bu geri alınamaz!')){localStorage.removeItem('ydt_progress2');localStorage.removeItem('ydt_errors');localStorage.removeItem('ydt_pv_errors');location.reload()}">🗑️ Tüm İlerlemeyi Sıfırla</button>
  `;
}

// Utilities
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.classList.remove('show'); }, 2500);
}

function logActivity() { /* Simple placeholder for future chart usage */ }

// ===== KİŞİSEL KELİMELERİM =====
function initTheme() {
  const saved = localStorage.getItem('ydt_theme');
  const isDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.add(isDark ? 'dark' : 'light');
  document.getElementById('theme-toggle-btn').textContent = isDark ? '☀️' : '🌙';
}
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(isDark ? 'light' : 'dark');
  localStorage.setItem('ydt_theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-toggle-btn').textContent = isDark ? '🌙' : '☀️';
}

// ===== PHRASAL VERBS DATA =====

// ===== USER META OVERRIDES (localStorage) =====
let userMeta = JSON.parse(localStorage.getItem('ydt_user_meta') || '{}');
function saveUserMeta() { localStorage.setItem('ydt_user_meta', JSON.stringify(userMeta)); }

function getUserMeta(word) {
  const key = word.toLowerCase().trim();
  return userMeta[key] || null;
}

function getWordMetaFull(word) {
  const base = getWordMeta(word);
  const override = getUserMeta(word);
  if (!override) return base;
  return {
    synonyms: override.s !== undefined ? override.s : base.synonyms,
    antonyms: override.a !== undefined ? override.a : base.antonyms,
    family: override.f !== undefined ? override.f : base.family
  };
}

// ===== META EDIT MODAL =====
function openMetaEdit(wordStr) {
  const meta = getWordMetaFull(wordStr);
  const modal = document.getElementById('meta-edit-content');
  modal.innerHTML = `
    <div class="word-modal-handle"></div>
    <div style="padding:20px 20px 0">
      <div style="font-size:18px;font-weight:800;color:var(--accent)">${esc(wordStr)}</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:16px">Eş anlam, zıt anlam ve kelime ailesini düzenle</div>
    </div>
    <div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:16px">
      <div>
        <div class="add-word-label" style="margin-bottom:6px">🟢 Eş Anlamlılar (virgülle ayır)</div>
        <input class="add-word-input" id="meta-syn" placeholder="örn: happy, joyful, glad"
          value="${esc(meta.synonyms.join(', '))}">
      </div>
      <div>
        <div class="add-word-label" style="margin-bottom:6px">🔴 Zıt Anlamlılar (virgülle ayır)</div>
        <input class="add-word-input" id="meta-ant" placeholder="örn: sad, unhappy, gloomy"
          value="${esc(meta.antonyms.join(', '))}">
      </div>
      <div>
        <div class="add-word-label" style="margin-bottom:6px">🔵 Kelime Ailesi (virgülle ayır)</div>
        <input class="add-word-input" id="meta-fam" placeholder="örn: happiness, happily"
          value="${esc(meta.family.join(', '))}">
      </div>
      <button class="save-word-btn" onclick="saveMetaEdit('${escQ(wordStr)}')">💾 Kaydet</button>
      <button style="background:transparent;border:1.5px solid var(--border2);color:var(--text3);border-radius:14px;padding:14px;font-size:14px;font-weight:600;width:100%" onclick="closeMetaEdit()">İptal</button>
    </div>
  `;
  document.getElementById('meta-edit-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function saveMetaEdit(wordStr) {
  const synVal = document.getElementById('meta-syn').value.trim();
  const antVal = document.getElementById('meta-ant').value.trim();
  const famVal = document.getElementById('meta-fam').value.trim();
  const key = wordStr.toLowerCase().trim();
  userMeta[key] = {
    s: synVal ? synVal.split(',').map(x => x.trim()).filter(Boolean) : [],
    a: antVal ? antVal.split(',').map(x => x.trim()).filter(Boolean) : [],
    f: famVal ? famVal.split(',').map(x => x.trim()).filter(Boolean) : []
  };
  saveUserMeta();
  closeMetaEdit();
  showToast('✓ Meta bilgisi güncellendi!');
  // Reopen word modal to show updated info
  openWordModal(wordStr);
}

function closeMetaEdit() {
  const overlay = document.getElementById('meta-edit-overlay');
  const modal = overlay.querySelector('.word-modal');
  if (modal) modal.classList.add('closing');
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('closing');
    if (modal) modal.classList.remove('closing');
    document.body.style.overflow = '';
  }, 220);
}

// ===== PHRASAL VERBS SCREEN =====
let pvCurrentUnit = 1;
let pvSearchTimer = null;

function showPhrasalVerbs(unit) {
  pvCurrentUnit = unit || 1;
  showScreen('screen-phrasal');
  renderPhrasalVerbs('');
}

function renderPhrasalVerbs(filter) {
  const s = document.getElementById('screen-phrasal');
  const unitKeys = Object.keys(PHRASAL_VERBS).map(Number);
  // pvCurrentUnit=0 means "all"
  const list = pvCurrentUnit === 0
    ? Object.values(PHRASAL_VERBS).flat()
    : (PHRASAL_VERBS[pvCurrentUnit] || []);
  const norm = filter.trim().toLowerCase();
  const filtered = norm
    ? list.filter(p => p.pv.toLowerCase().includes(norm) || p.tr.toLowerCase().includes(norm))
    : list;

  const allTabHtml = `<button class="pill ${pvCurrentUnit === 0 ? 'active' : ''}" onclick="pvCurrentUnit=0;renderPhrasalVerbs(document.getElementById('pv-search').value)" style="${pvCurrentUnit === 0 ? 'background:var(--accent);color:white;border-color:var(--accent)' : ''}">Tümü</button>`;
  const tabsHtml = unitKeys.map(u => `
    <button class="pill ${u === pvCurrentUnit ? 'active' : ''}" onclick="pvCurrentUnit=${u};renderPhrasalVerbs(document.getElementById('pv-search').value)" style="${u === pvCurrentUnit ? 'background:var(--accent);color:white;border-color:var(--accent)' : ''}">Ünite ${u}</button>
  `).join('');

  const itemsHtml = filtered.length === 0
    ? `<div style="text-align:center;color:var(--text3);padding:32px">Sonuç bulunamadı.</div>`
    : filtered.map((p, i) => `
      <div class="pv-item" onclick="togglePV(this)" data-idx="${i}">
        <div class="pv-header">
          <div class="pv-verb">${esc(p.pv)}</div>
          <span class="learn-expand">▸</span>
        </div>
        <div class="pv-tr">${esc(p.tr.split('\n')[0])}${p.tr.includes('\n') ? ' <span style="color:var(--text3);font-size:11px">+daha</span>' : ''}</div>
        <div class="pv-detail" style="display:none">
          ${p.tr.split('\n').length > 1 ? `<div style="margin-bottom:10px">${p.tr.split('\n').map((t, j) => `<div style="font-size:13px;color:var(--text2);padding:2px 0"><span style="color:#e67e22;font-weight:700">${j + 1}.</span> ${esc(t.replace(/^\d+\.\s*/, ''))}</div>`).join('')}</div>` : `<div style="font-size:13px;color:var(--text2);margin-bottom:10px">${esc(p.tr)}</div>`}
          ${p.ex ? `<div style="font-style:italic;font-size:13px;color:var(--text3);background:var(--bg);padding:10px 12px;border-radius:10px;line-height:1.5">"${esc(p.ex)}"</div>` : ''}
        </div>
      </div>
    `).join('');

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="goHome()">←</button>
      <div>
        <div class="unit-title-h">🔗 Phrasal Verbs</div>
        <div class="unit-sub">${filtered.length} / ${list.length} deyimsel fiil</div>
      </div>
    </div>
    <div class="learn-wrap" style="gap:0;padding-bottom:16px">
      <div style="padding:12px 16px 0;flex-shrink:0">
        <input class="learn-search" id="pv-search" placeholder="Phrasal verb veya Türkçe ara..." 
          oninput="clearTimeout(pvSearchTimer);pvSearchTimer=setTimeout(()=>renderPhrasalVerbs(this.value),200)" 
          value="${esc(filter)}" style="margin-bottom:10px">
        <div class="pills" style="flex-wrap:nowrap;overflow-x:auto;padding-bottom:8px;gap:6px">
          ${allTabHtml}${tabsHtml}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:4px">
          <button style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--card);border:1.5px solid rgba(230,126,34,0.3);border-radius:12px;padding:10px 6px;font-size:12px;font-weight:700;color:#e67e22;cursor:pointer;transition:all 0.2s" onclick="startPVFlash()" onmouseover="this.style.background='rgba(230,126,34,0.06)'" onmouseout="this.style.background='var(--card)'">
            <span style="font-size:20px">🃏</span>Flash Kartlar
          </button>
          <button style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--card);border:1.5px solid rgba(230,126,34,0.3);border-radius:12px;padding:10px 6px;font-size:12px;font-weight:700;color:#e67e22;cursor:pointer;transition:all 0.2s" onclick="startPVQuiz()" onmouseover="this.style.background='rgba(230,126,34,0.06)'" onmouseout="this.style.background='var(--card)'">
            <span style="font-size:20px">✅</span>Çoktan Seçmeli
          </button>
          <button style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--card);border:1.5px solid rgba(230,126,34,0.3);border-radius:12px;padding:10px 6px;font-size:12px;font-weight:700;color:#e67e22;cursor:pointer;transition:all 0.2s" onclick="startPVFib()" onmouseover="this.style.background='rgba(230,126,34,0.06)'" onmouseout="this.style.background='var(--card)'">
            <span style="font-size:20px">✏️</span>Boşluk Doldur
          </button>
        </div>
      </div>
      <div class="learn-list" style="margin-top:6px">${itemsHtml}</div>
    </div>
  `;
}

function togglePV(el) {
  const detail = el.querySelector('.pv-detail');
  const arrow = el.querySelector('.learn-expand');
  const isOpen = detail.style.display !== 'none';
  document.querySelectorAll('.pv-detail').forEach(d => d.style.display = 'none');
  document.querySelectorAll('#screen-phrasal .learn-expand').forEach(a => a.textContent = '▸');
  if (!isOpen) {
    detail.style.display = 'block';
    arrow.textContent = '▾';
  }
}

// ===== PV HELPERS =====
let pvErrors = JSON.parse(localStorage.getItem('ydt_pv_errors') || '{}');
function savePVErrors() { localStorage.setItem('ydt_pv_errors', JSON.stringify(pvErrors)); updateErrorBadge(); }

function getPVPool() {
  if (pvCurrentUnit === 0) {
    let all = [];
    Object.entries(PHRASAL_VERBS).forEach(([u, arr]) => arr.forEach(p => all.push({ ...p, _unit: Number(u) })));
    return all;
  }
  return (PHRASAL_VERBS[pvCurrentUnit] || []).map(p => ({ ...p, _unit: pvCurrentUnit }));
}

// ===== PV FLASH CARDS =====
let pvFlashCards = [], pvFlashIdx = 0, pvFlashKnown = [], pvFlashUnknown = [];
let pvFlashRevealed = false;

function startPVFlash() {
  const pool = getPVPool();
  if (pool.length === 0) { showToast('Bu ünitede phrasal verb yok!'); return; }
  pvFlashCards = shuffle(pool);
  pvFlashIdx = 0; pvFlashKnown = []; pvFlashUnknown = [];
  showScreen('screen-phrasal-flash');
  renderPVFlash();
}

function renderPVFlash() {
  const s = document.getElementById('screen-phrasal-flash');
  if (pvFlashIdx >= pvFlashCards.length) { renderPVFlashResult(); return; }
  const card = pvFlashCards[pvFlashIdx];
  const total = pvFlashCards.length;
  const pct = Math.round((pvFlashIdx / total) * 100);
  pvFlashRevealed = false;

  const meaningLines = card.tr.split('\n');
  const meaningHtml = meaningLines.length > 1
    ? meaningLines.map((t, i) => `<div style="padding:2px 0"><span style="color:#e67e22;font-weight:800;margin-right:6px">${i + 1}.</span>${esc(t.replace(/^\d+\.\s*/, ''))}</div>`).join('')
    : `<div>${esc(card.tr)}</div>`;

  const pvEscaped = card.pv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exMasked = card.ex ? card.ex.replace(new RegExp(pvEscaped, 'gi'), '____') : '';

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="showPhrasalVerbs(pvCurrentUnit||1)">←</button>
      <div>
        <div class="unit-title-h">🃏 PV Flash Kartlar</div>
        <div class="unit-sub">${pvFlashIdx + 1}/${total} · ${pvCurrentUnit === 0 ? 'Tümü' : 'Ünite ' + card._unit}</div>
      </div>
    </div>
    <div class="flash-wrap">
      <div class="flash-progress-row">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="flash-counter-badge">${pvFlashIdx + 1}/${total}</span>
      </div>
      <div class="flash-card-wrap">
        <div class="flash-card" id="pv-fc" style="border-radius:24px">
          <!-- FRONT -->
          <div class="flash-face flash-front" style="border-color:rgba(230,126,34,0.3)">
            <div style="position:absolute;top:14px;right:14px;font-size:10px;font-weight:700;color:#e67e22;background:rgba(230,126,34,0.1);border:1px solid rgba(230,126,34,0.3);border-radius:10px;padding:2px 8px">Ünite ${card._unit}</div>
            <div style="font-size:26px;margin-bottom:10px;opacity:0.3">👆</div>
            <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Phrasal Verb</div>
            <div style="font-size:clamp(22px,6vw,32px);font-weight:800;color:#e67e22;line-height:1.2;margin-bottom:12px">${esc(card.pv)}</div>
            ${exMasked ? `<div style="font-size:13px;font-style:italic;color:var(--text3);background:var(--bg);padding:10px 14px;border-radius:12px;line-height:1.6;margin-top:4px">"${esc(exMasked)}"</div>` : ''}
            <div style="font-size:12px;font-weight:500;color:var(--text3);margin-top:14px">Ortaya dokun — anlamı gör</div>
          </div>
          <!-- BACK -->
          <div class="flash-face flash-back" style="background:linear-gradient(145deg,#e67e22,#d35400)">
            <div style="position:absolute;top:-50px;right:-50px;width:150px;height:150px;background:rgba(255,255,255,0.07);border-radius:50%"></div>
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;position:relative;z-index:1">Türkçe Anlam</div>
            <div style="font-size:clamp(15px,4vw,20px);font-weight:700;color:#fff;line-height:1.7;position:relative;z-index:1">${meaningHtml}</div>
            ${card.ex ? `<div style="font-size:12px;font-style:italic;color:rgba(255,255,255,0.85);background:rgba(0,0,0,0.12);padding:10px 14px;border-radius:12px;line-height:1.5;margin-top:14px;position:relative;z-index:1">"${esc(card.ex)}"</div>` : ''}
          </div>
        </div>
      </div>
      <div class="flash-swipe-guide">
        <div class="flash-guide-item"><div class="flash-guide-dot" style="background:var(--error)"></div><span style="color:var(--error)">← Bilmedim</span></div>
        <span style="font-size:10px;color:var(--text3)">sürükle veya bas</span>
        <div class="flash-guide-item"><span style="color:var(--success)">Bildim →</span><div class="flash-guide-dot" style="background:var(--success)"></div></div>
      </div>
      <div class="swipe-btn-row">
        <button class="swipe-btn wrong" id="pvbtn-wrong" onclick="pvFlashAnswer(false)">✗ Bilmedim</button>
        <button class="swipe-btn right" id="pvbtn-right" onclick="pvFlashAnswer(true)">✓ Bildim</button>
      </div>
    </div>
  `;
  initPVFlashDrag();
}

function initPVFlashDrag() {
  const fc = document.getElementById('pv-fc');
  if (!fc) return;
  let startX = 0, startY = 0, curX = 0, isDragging = false, didDrag = false, isFlipped = false;
  const SWIPE_THRESHOLD = 80, DRAG_START_MIN = 8;

  function onStart(x, y) { startX = x; startY = y; curX = x; isDragging = true; didDrag = false; }

  function onMove(x, y) {
    if (!isDragging) return;
    const dx = x - startX, dy = y - startY;
    if (!didDrag && Math.abs(dy) > Math.abs(dx)) { isDragging = false; return; }
    if (Math.abs(dx) < DRAG_START_MIN && !didDrag) return;
    didDrag = true; curX = x;
    const rot = Math.min(18, Math.max(-18, dx / 12));
    isFlipped = fc.style.transform.includes('rotateY(180deg)');
    fc.classList.add('dragging');
    fc.style.transform = `translateX(${dx}px) rotate(${rot}deg)${isFlipped ? ' rotateY(180deg)' : ''}`;
    const progress = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD);
    const btnW = document.getElementById('pvbtn-wrong'), btnR = document.getElementById('pvbtn-right');
    if (dx < 0) {
      if (btnW) { btnW.classList.add('drag-hint-left'); btnW.classList.remove('drag-hint-right'); }
      if (btnR) btnR.classList.remove('drag-hint-right');
    } else if (dx > 0) {
      if (btnR) { btnR.classList.add('drag-hint-right'); btnR.classList.remove('drag-hint-left'); }
      if (btnW) btnW.classList.remove('drag-hint-left');
    } else {
      if (btnW) btnW.classList.remove('drag-hint-left');
      if (btnR) btnR.classList.remove('drag-hint-right');
    }
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    const dx = curX - startX;
    fc.classList.remove('dragging');
    const btnW = document.getElementById('pvbtn-wrong'), btnR = document.getElementById('pvbtn-right');
    if (btnW) btnW.classList.remove('drag-hint-left');
    if (btnR) btnR.classList.remove('drag-hint-right');
    if (!didDrag) { flipPVCard(); return; }
    if (dx < -SWIPE_THRESHOLD) pvFlashAnswer(false);
    else if (dx > SWIPE_THRESHOLD) pvFlashAnswer(true);
    else {
      isFlipped = fc.style.transform.includes('rotateY(180deg)');
      fc.style.transition = 'transform 0.4s cubic-bezier(0.2,0.8,0.2,1)';
      fc.style.transform = isFlipped ? 'rotateY(180deg)' : '';
      setTimeout(() => { if (fc) fc.style.transition = ''; }, 400);
    }
  }

  fc.addEventListener('touchstart', e => { const t = e.touches[0]; onStart(t.clientX, t.clientY); }, { passive: true });
  fc.addEventListener('touchmove', e => {
    const t = e.touches[0]; onMove(t.clientX, t.clientY);
    if (isDragging && Math.abs(t.clientX - startX) > DRAG_START_MIN) e.preventDefault();
  }, { passive: false });
  fc.addEventListener('touchend', () => onEnd());
  fc.addEventListener('touchcancel', () => onEnd());
  fc.addEventListener('mousedown', e => {
    onStart(e.clientX, e.clientY);
    const mv = ev => onMove(ev.clientX, ev.clientY);
    const up = () => { onEnd(); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
}

function flipPVCard() {
  const fc = document.getElementById('pv-fc');
  if (!fc) return;
  const flipped = fc.style.transform.includes('rotateY(180deg)');
  fc.style.transition = 'transform 0.55s cubic-bezier(0.2,0.8,0.2,1)';
  fc.style.transform = flipped ? '' : 'rotateY(180deg)';
  setTimeout(() => { if (fc) fc.style.transition = ''; }, 600);
}

function pvFlashAnswer(known) {
  const card = pvFlashCards[pvFlashIdx];
  const fc = document.getElementById('pv-fc');
  if (fc) {
    fc.style.transition = 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease';
    const flipped = fc.style.transform.includes('rotateY(180deg)');
    fc.style.transform = known
      ? `translateX(110vw) rotate(22deg)${flipped ? ' rotateY(180deg)' : ''}`
      : `translateX(-110vw) rotate(-22deg)${flipped ? ' rotateY(180deg)' : ''}`;
    fc.style.opacity = '0';
  }
  const errKey = 'pv_' + card.pv.replace(/\s+/g, '_');
  if (known) {
    pvFlashKnown.push(card);
    if (pvErrors[errKey]) { delete pvErrors[errKey]; savePVErrors(); }
  } else {
    pvFlashUnknown.push(card);
    pvErrors[errKey] = { pv: card.pv, tr: card.tr.split('\n')[0], unit: card._unit };
    savePVErrors();
  }
  setTimeout(() => { pvFlashIdx++; renderPVFlash(); }, 370);
}

function renderPVFlashResult() {
  const s = document.getElementById('screen-phrasal-flash');
  const known = pvFlashKnown.length, total = pvFlashCards.length;
  s.innerHTML = `
    <div class="result-wrap">
      <div class="result-emoji">${known === total ? '🏆' : known > total / 2 ? '💪' : '📚'}</div>
      <div class="result-title">${known === total ? 'Mükemmel!' : 'Sonuçlar'}</div>
      <div class="result-sub">${total} karttan ${known} tanesini bildiniz</div>
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num" style="color:var(--success)">${known}</div><div class="stat-lbl">Bildim ✓</div></div>
        <div class="stat-box"><div class="stat-num" style="color:var(--error)">${pvFlashUnknown.length}</div><div class="stat-lbl">Bilmedim ✗</div></div>
      </div>
      ${pvFlashUnknown.length > 0 ? `<button class="result-btn" onclick="pvFlashCards=shuffle([...pvFlashUnknown]);pvFlashIdx=0;pvFlashKnown=[];pvFlashUnknown=[];renderPVFlash()">🔁 Bilemediklerimi Tekrar Et</button>` : ''}
      <button class="result-btn" onclick="startPVFlash()">🔀 Yeniden Başla</button>
      <button class="result-btn outline" onclick="showPhrasalVerbs(pvCurrentUnit||1)">← Geri Dön</button>
    </div>`;
}

// ===== PV MULTIPLE CHOICE =====
let pvQuizCards = [], pvQuizIdx = 0, pvQuizScore = 0;

function startPVQuiz() {
  const pool = getPVPool();
  if (pool.length < 4) { showToast('Test için en az 4 phrasal verb gerekli!'); return; }
  pvQuizCards = shuffle(pool);
  pvQuizIdx = 0; pvQuizScore = 0;
  showScreen('screen-phrasal-quiz');
  renderPVQuiz();
}

function renderPVQuiz() {
  const s = document.getElementById('screen-phrasal-quiz');
  const total = pvQuizCards.length;
  if (pvQuizIdx >= total) { renderPVQuizResult(); return; }
  const card = pvQuizCards[pvQuizIdx];
  const pct = Math.round((pvQuizIdx / total) * 100);

  // Wrong options from all PVs
  const allPool = [];
  Object.values(PHRASAL_VERBS).forEach(arr => arr.forEach(p => { if (p.pv !== card.pv) allPool.push(p); }));
  const wrongOpts = shuffle(allPool).slice(0, 3);
  const opts = shuffle([card, ...wrongOpts]);
  const optId = 'pvq' + pvQuizIdx;

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="showPhrasalVerbs(pvCurrentUnit||1)">←</button>
      <div>
        <div class="unit-title-h">✅ PV Çoktan Seçmeli</div>
        <div class="unit-sub">${pvQuizIdx + 1}/${total} · ${pvCurrentUnit === 0 ? 'Tümü' : 'Ünite ' + card._unit}</div>
      </div>
    </div>
    <div class="mc-wrap">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="mc-question">
        <div style="display:inline-block;background:rgba(230,126,34,0.12);color:#e67e22;border:1px solid rgba(230,126,34,0.25);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Phrasal Verb</div>
        <div class="mc-q-word" style="color:#e67e22">${esc(card.pv)}</div>
        ${card.ex ? `<div class="mc-q-example">"${esc(card.ex)}"</div>` : ''}
      </div>
      <div class="mc-options" id="${optId}">
        ${opts.map(o => `
          <button class="mc-opt" data-pv="${escQ(o.pv)}"
            onclick="checkPVQuiz(this,'${optId}','${escQ(o.pv)}','${escQ(card.pv)}','${escQ(String(card._unit))}')">
            ${esc(o.tr.split('\n')[0])}
          </button>`).join('')}
      </div>
    </div>`;
}

function checkPVQuiz(btn, containerId, chosen, correct, unitVal) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.mc-opt').forEach(b => b.classList.add('disabled'));
  const errKey = 'pv_' + correct.replace(/\s+/g, '_');
  if (chosen === correct) {
    btn.classList.add('correct'); pvQuizScore++;
    if (pvErrors[errKey]) { delete pvErrors[errKey]; savePVErrors(); }
    setTimeout(() => { pvQuizIdx++; renderPVQuiz(); }, 1000);
  } else {
    btn.classList.add('wrong');
    container.querySelectorAll('.mc-opt').forEach(b => { if (b.dataset.pv === correct) b.classList.add('correct'); });
    pvErrors[errKey] = { pv: correct, tr: pvQuizCards[pvQuizIdx].tr.split('\n')[0], unit: parseInt(unitVal) || pvCurrentUnit };
    savePVErrors();
    setTimeout(() => { pvQuizIdx++; renderPVQuiz(); }, 1600);
  }
}

function renderPVQuizResult() {
  const s = document.getElementById('screen-phrasal-quiz');
  const total = pvQuizCards.length, pct = Math.round((pvQuizScore / total) * 100);
  s.innerHTML = `
    <div class="result-wrap">
      <div class="result-emoji">${pct >= 80 ? '🎯' : pct >= 50 ? '👍' : '💡'}</div>
      <div class="result-title">${pct}% Başarı</div>
      <div class="result-sub">${total} sorudan ${pvQuizScore} doğru</div>
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num" style="color:var(--success)">${pvQuizScore}</div><div class="stat-lbl">Doğru</div></div>
        <div class="stat-box"><div class="stat-num" style="color:var(--error)">${total - pvQuizScore}</div><div class="stat-lbl">Yanlış</div></div>
      </div>
      <button class="result-btn" onclick="startPVQuiz()">🔀 Yeniden Başla</button>
      <button class="result-btn outline" onclick="showPhrasalVerbs(pvCurrentUnit||1)">← Geri Dön</button>
    </div>`;
}

// ===== PV FILL IN THE BLANK =====
let pvFibCards = [], pvFibIdx = 0, pvFibScore = 0;

function startPVFib() {
  const pool = getPVPool().filter(p => p.ex && p.ex.trim());
  if (pool.length === 0) { showToast('Bu ünitede örnek cümle olan phrasal verb yok!'); return; }
  pvFibCards = shuffle(pool);
  pvFibIdx = 0; pvFibScore = 0;
  showScreen('screen-phrasal-quiz');
  renderPVFib();
}

function renderPVFib() {
  const s = document.getElementById('screen-phrasal-quiz');
  const total = pvFibCards.length;
  if (pvFibIdx >= total) { renderPVFibResult(); return; }
  const card = pvFibCards[pvFibIdx];
  const pct = Math.round((pvFibIdx / total) * 100);

  // Mask the phrasal verb in the example sentence
  const pvEscaped = card.pv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sentence = card.ex.replace(new RegExp(pvEscaped, 'gi'), '<span class="fib-blank" style="min-width:90px">_____</span>');

  s.innerHTML = `
    <div class="unit-header">
      <button class="back-btn" onclick="showPhrasalVerbs(pvCurrentUnit||1)">←</button>
      <div>
        <div class="unit-title-h">✏️ PV Boşluk Doldur</div>
        <div class="unit-sub">${pvFibIdx + 1}/${total} · ${pvCurrentUnit === 0 ? 'Tümü' : 'Ünite ' + card._unit}</div>
      </div>
    </div>
    <div class="fib-wrap">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="fib-question" style="border-left:3px solid #e67e22">
        <div class="mc-q-label" style="color:#e67e22">Cümledeki boşluğu doldurun</div>
        <div class="fib-sentence">${sentence}</div>
        <div class="fib-hint" style="margin-top:14px">
          Türkçe İpucu: <b style="color:#e67e22">${esc(card.tr.split('\n')[0])}</b>
        </div>
      </div>
      <div class="fib-input-area">
        <div class="fib-input-row">
          <input class="fib-input" id="pvfib-inp" placeholder="Phrasal verb'i yaz..." autocomplete="off" autocapitalize="none" spellcheck="false"
            onkeydown="if(event.key==='Enter')checkPVFib()">
          <button class="fib-submit" style="background:#e67e22;box-shadow:0 4px 12px rgba(230,126,34,0.3)" onclick="checkPVFib()">Kontrol</button>
        </div>
        <div id="pvfib-feedback"></div>
        <button id="pvfib-next-btn" class="fib-submit" style="display:none;width:100%;background:var(--text);color:white" onclick="pvFibIdx++;renderPVFib()">Sonraki →</button>
      </div>
    </div>`;
  setTimeout(() => { const inp = document.getElementById('pvfib-inp'); if (inp) inp.focus(); }, 100);
}

function checkPVFib() {
  const inp = document.getElementById('pvfib-inp');
  const fb = document.getElementById('pvfib-feedback');
  const nextBtn = document.getElementById('pvfib-next-btn');
  if (!inp || inp.disabled) return;
  const answer = inp.value.trim().toLowerCase();
  if (!answer) { showToast('Cevap yazmalısınız!'); return; }
  const card = pvFibCards[pvFibIdx];
  const correct = card.pv.toLowerCase();
  inp.disabled = true;

  // Accept close matches (ignore articles, minor typos handled via includes)
  if (answer === correct || correct.includes(answer) && answer.length > correct.length - 3) {
    inp.classList.add('correct');
    fb.className = 'fib-feedback correct';
    fb.textContent = '✓ Harika! Doğru cevap.';
    pvFibScore++;
    const errKey = 'pv_' + card.pv.replace(/\s+/g, '_');
    if (pvErrors[errKey]) { delete pvErrors[errKey]; savePVErrors(); }
    setTimeout(() => { pvFibIdx++; renderPVFib(); }, 1200);
  } else {
    inp.classList.add('wrong');
    fb.className = 'fib-feedback wrong';
    fb.innerHTML = `✗ Yanlış. Doğru cevap: <b style="color:#e67e22">${esc(card.pv)}</b>`;
    const errKey = 'pv_' + card.pv.replace(/\s+/g, '_');
    pvErrors[errKey] = { pv: card.pv, tr: card.tr.split('\n')[0], unit: card._unit };
    savePVErrors();
    nextBtn.style.display = 'block';
  }
}

function renderPVFibResult() {
  const s = document.getElementById('screen-phrasal-quiz');
  const total = pvFibCards.length, pct = Math.round((pvFibScore / total) * 100);
  s.innerHTML = `
    <div class="result-wrap">
      <div class="result-emoji">${pct >= 80 ? '✨' : pct >= 50 ? '📝' : '🔁'}</div>
      <div class="result-title">${pct}% Başarı</div>
      <div class="result-sub">Boşluk Doldur · ${total} sorudan ${pvFibScore} doğru</div>
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num" style="color:var(--success)">${pvFibScore}</div><div class="stat-lbl">Doğru</div></div>
        <div class="stat-box"><div class="stat-num" style="color:var(--error)">${total - pvFibScore}</div><div class="stat-lbl">Yanlış</div></div>
      </div>
      <button class="result-btn" style="background:#e67e22;box-shadow:0 4px 16px rgba(230,126,34,0.3)" onclick="startPVFib()">🔀 Yeniden Başla</button>
      <button class="result-btn outline" onclick="showPhrasalVerbs(pvCurrentUnit||1)">← Geri Dön</button>
    </div>`;
}

// ===== PATCH openWordModal to use getWordMetaFull & add Edit button =====
const _origOpenWordModal = openWordModal;
function openWordModal(wordStr) {
  let foundWord = null, foundUnit = null;
  for (let u = 1; u <= 10; u++) {
    const w = UNITS[u].words.find(w => w[0] === wordStr);
    if (w) { foundWord = w; foundUnit = u; break; }
  }
  if (!foundWord) return;

  const meta = getWordMetaFull(wordStr);
  const isLearned = getLearnedSet(foundUnit).has(wordStr);
  const hasError = !!errorBox['u' + foundUnit + '_' + wordStr];

  const synHtml = meta.synonyms.length
    ? meta.synonyms.map(s => `<span class="word-chip syn" onclick="openWordModal('${escQ(s)}')">${esc(s)}</span>`).join('')
    : '<span style="color:var(--text3);font-size:13px">Veri yok</span>';
  const antHtml = meta.antonyms.length
    ? meta.antonyms.map(s => `<span class="word-chip ant" onclick="openWordModal('${escQ(s)}')">${esc(s)}</span>`).join('')
    : '<span style="color:var(--text3);font-size:13px">Veri yok</span>';
  const famHtml = meta.family.length
    ? meta.family.map(s => `<span class="word-chip fam" onclick="openWordModal('${escQ(s)}')">${esc(s)}</span>`).join('')
    : '<span style="color:var(--text3);font-size:13px">Veri yok</span>';

  const modal = document.getElementById('word-modal-content');
  modal.innerHTML = `
    <div class="word-modal-handle"></div>
    <div class="word-modal-header">
      <div>
        <div class="word-modal-title-row">
          <div class="word-modal-title">${esc(foundWord[0])}</div>
          <button class="pronounce-btn" onclick="speakWord('${escQ(foundWord[0])}')" title="Telaffuz dinle">🔊</button>
        </div>
        <div class="word-modal-meaning">${esc(foundWord[1])}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span class="word-modal-unit">Ünite ${foundUnit}</span>
        ${isLearned ? '<span style="font-size:11px;color:var(--success);font-weight:700">✓ Öğrenildi</span>' : ''}
        ${hasError ? '<span style="font-size:11px;color:var(--error);font-weight:700">⚠ Hata Kutusunda</span>' : ''}
      </div>
    </div>
    ${foundWord[2] ? `<div class="word-modal-example">"${esc(foundWord[2])}"</div>` : ''}
    <div class="word-modal-divider"></div>
    <div class="word-modal-section">
      <div class="word-modal-section-title">🟢 Eş Anlamlılar</div>
      <div class="word-modal-chips">${synHtml}</div>
    </div>
    <div class="word-modal-section">
      <div class="word-modal-section-title">🔴 Zıt Anlamlılar</div>
      <div class="word-modal-chips">${antHtml}</div>
    </div>
    <div class="word-modal-section">
      <div class="word-modal-section-title">🔵 Kelime Ailesi</div>
      <div class="word-modal-chips">${famHtml}</div>
    </div>
    <div class="word-modal-divider"></div>
    <div class="word-modal-actions">
      ${isLearned
      ? `<button class="word-modal-btn" onclick="markUnlearned(${foundUnit},'${escQ(wordStr)}');closeWordModal();showToast('Öğrenilmedi olarak işaretlendi')">↩ Geri Al</button>`
      : `<button class="word-modal-btn primary" onclick="markLearned(${foundUnit},'${escQ(wordStr)}');closeWordModal();showToast('✓ Öğrenildi olarak işaretlendi!')">✓ Öğrendim</button>`
    }
      <button class="word-modal-btn" onclick="closeWordModal();openMetaEdit('${escQ(wordStr)}')">✏️ Düzenle</button>
      <button class="word-modal-btn" onclick="closeWordModal()">Kapat</button>
    </div>
  `;

  const overlay = document.getElementById('word-modal-overlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

// Also patch toggleLearnMeta to use getWordMetaFull
const _origToggleLearnMeta = toggleLearnMeta;
function toggleLearnMeta(el) {
  const word = el.dataset.word;
  const meaning = el.dataset.meaning;
  const example = el.dataset.example;
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.learn-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) {
    el.classList.add('open');
    const meta = getWordMetaFull(word);
    const detail = el.querySelector('.learn-detail');
    if (detail) {
      const synHtml = meta.synonyms.length ? meta.synonyms.map(s => `<span class="word-chip syn">${esc(s)}</span>`).join('') : '<span style="color:var(--text3);font-size:12px">Veri yok</span>';
      const antHtml = meta.antonyms.length ? meta.antonyms.map(s => `<span class="word-chip ant">${esc(s)}</span>`).join('') : '<span style="color:var(--text3);font-size:12px">Veri yok</span>';
      const famHtml = meta.family.length ? meta.family.map(s => `<span class="word-chip fam">${esc(s)}</span>`).join('') : '<span style="color:var(--text3);font-size:12px">Veri yok</span>';
      const safeId = word.replace(/[^a-zA-Z0-9]/g, '_');
      detail.innerHTML = `
        ${example && example !== 'undefined' ? `<div style="font-style:italic;color:var(--text3);margin-bottom:12px;background:var(--bg);padding:10px;border-radius:8px">"${esc(example)}"</div>` : ''}
        <div class="word-detail-tabs">
          <button class="wdt-tab active" onclick="switchLearnTab(event,this,'syn-${safeId}')">Eş Anlam</button>
          <button class="wdt-tab" onclick="switchLearnTab(event,this,'ant-${safeId}')">Zıt Anlam</button>
          <button class="wdt-tab" onclick="switchLearnTab(event,this,'fam-${safeId}')">Kelime Ailesi</button>
          <button class="wdt-tab" onclick="openWordModal('${escQ(word)}');event.stopPropagation()">🔍 Detay</button>
        </div>
        <div class="word-detail-content" id="tab-syn-${safeId}">${synHtml}</div>
        <div class="word-detail-content" id="tab-ant-${safeId}" style="display:none">${antHtml}</div>
        <div class="word-detail-content" id="tab-fam-${safeId}" style="display:none">${famHtml}</div>
      `;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  gamification.js  —  XP · Seviye · Streak · Cevap Animasyonları
//  Bu dosya app.js'ten SONRA yüklenmeli (index.html'de sonda)
// ═══════════════════════════════════════════════════════════════

/* ────────────────────────────────────────────────────────────────
   XP TABLOSU
   ─────────────────────────────────────────────────────────────── */
const XP_REWARDS = {
  flash_correct: 8,    // flash kart → Bildim
  mc_correct: 10,   // çoktan seçmeli doğru
  fib_correct: 15,   // boşluk doldurma doğru (yazarak)
  syn_correct: 10,   // eş anlam quiz doğru
  ant_correct: 10,   // zıt anlam quiz doğru
  pv_flash_correct: 10,   // phrasal verb flash doğru
  pv_quiz_correct: 12,   // phrasal verb quiz doğru
  mark_learned: 5,    // sözlükten "Öğrendim" butonu
};

const LEVEL_THRESHOLDS = [
  0, 100, 250, 450, 700, 1000,
  1350, 1750, 2200, 2700, 3300,
  4000, 4800, 5700, 6700, 8000
];

const LEVEL_NAMES = [
  'Çaylak', 'Meraklı', 'Öğrenci', 'Çalışkan',
  'Başarılı', 'Uzman', 'Usta', 'Scholar',
  'Akademik', 'Profesör', 'Genius', 'Legend',
  'Polyglot', 'Mastermind', 'YDT Champion', 'MARVEL ✦'
];

/* ────────────────────────────────────────────────────────────────
   STREAK ROZETLERI
   ─────────────────────────────────────────────────────────────── */
const STREAK_BADGES = [
  { days: 3, icon: '🔥', label: '3 Günlük Seri', color: '#e67e22' },
  { days: 7, icon: '⚡', label: '1 Hafta Serisi', color: '#9b59b6' },
  { days: 14, icon: '💎', label: '2 Hafta Serisi', color: '#3498db' },
  { days: 30, icon: '👑', label: '30 Günlük Seri', color: '#f1c40f' },
  { days: 60, icon: '🌟', label: '60 Günlük Seri', color: '#1abc9c' },
  { days: 100, icon: '🏆', label: '100 Gün!', color: '#e74c3c' },
];

/* ────────────────────────────────────────────────────────────────
   STATE (localStorage)
   ─────────────────────────────────────────────────────────────── */
let _xpData = JSON.parse(localStorage.getItem('ydt_xp_v1') || '{"xp":0,"level":0}');
let _streakData = JSON.parse(localStorage.getItem('ydt_streak_v1') || '{"streak":0,"lastDate":"","longest":0}');

function _saveXP() { localStorage.setItem('ydt_xp_v1', JSON.stringify(_xpData)); }
function _saveStreak() { localStorage.setItem('ydt_streak_v1', JSON.stringify(_streakData)); }

/* ────────────────────────────────────────────────────────────────
   COMBO SYSTEM
   ─────────────────────────────────────────────────────────────── */
let _comboCount = 0;
let _comboMultiplier = 1;
const COMBO_THRESHOLDS = [
  { count: 3, multiplier: 1.5, label: '1.5x', icon: '🔥' },
  { count: 5, multiplier: 2, label: '2x', icon: '🔥🔥' },
  { count: 10, multiplier: 3, label: '3x', icon: '💥' },
  { count: 20, multiplier: 5, label: '5x', icon: '⚡' },
];

function _getComboMultiplier() {
  let mult = 1;
  for (const t of COMBO_THRESHOLDS) {
    if (_comboCount >= t.count) mult = t.multiplier;
  }
  return mult;
}

function _updateComboUI() {
  let existing = document.getElementById('combo-indicator');
  if (_comboCount < 3) {
    if (existing) existing.remove();
    return;
  }
  const mult = _getComboMultiplier();
  const comboData = COMBO_THRESHOLDS.find(t => t.count === _comboCount) || COMBO_THRESHOLDS[COMBO_THRESHOLDS.length - 1];
  
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'combo-indicator';
    document.getElementById('app').appendChild(existing);
  }
  existing.innerHTML = `<div class="combo-badge">${comboData.icon} ${_comboCount} COMBO ${comboData.label}</div>`;
  existing.classList.add('combo-active');
}

function _incrementCombo() {
  _comboCount++;
  _comboMultiplier = _getComboMultiplier();
  _updateComboUI();
}

function _resetCombo() {
  _comboCount = 0;
  _comboMultiplier = 1;
  _updateComboUI();
}

/* ────────────────────────────────────────────────────────────────
   ACHIEVEMENT SYSTEM
   ─────────────────────────────────────────────────────────────── */
const ACHIEVEMENTS = [
  { id: 'first_word', icon: '🌟', name: 'İlk Adım', desc: 'İlk kelimeyi öğren', category: 'learning' },
  { id: 'word_10', icon: '📚', name: 'Koleksiyoncu', desc: '10 kelime öğren', category: 'learning' },
  { id: 'word_50', icon: '📖', name: 'Kelime Dünyası', desc: '50 kelime öğren', category: 'learning' },
  { id: 'word_100', icon: '🏅', name: 'Sözlük Ustası', desc: '100 kelime öğren', category: 'learning' },
  { id: 'word_500', icon: '🎓', name: 'Akademisyen', desc: '500 kelime öğren', category: 'learning' },
  { id: 'word_1000', icon: '🧙', name: 'Kelime Büyücüsü', desc: '1000 kelime öğren', category: 'learning' },
  { id: 'streak_3', icon: '🔥', name: 'Ateşli Başlangıç', desc: '3 gün streak yap', category: 'streak' },
  { id: 'streak_7', icon: '⚡', name: 'Haftalık', desc: '7 gün streak yap', category: 'streak' },
  { id: 'streak_14', icon: '💎', name: 'İki Hafta', desc: '14 gün streak yap', category: 'streak' },
  { id: 'streak_30', icon: '👑', name: 'Aylık', desc: '30 gün streak yap', category: 'streak' },
  { id: 'streak_60', icon: '🌟', name: 'İkili Ay', desc: '60 gün streak yap', category: 'streak' },
  { id: 'streak_100', icon: '🏆', name: 'Efsane', desc: '100 gün streak yap', category: 'streak' },
  { id: 'streak_365', icon: '💎', name: 'Yıllık', desc: '365 gün streak yap', category: 'streak' },
  { id: 'daily_goal_7', icon: '🎯', name: 'Hedef Odaklı', desc: '7 gün hedefi tamamla', category: 'streak' },
  { id: 'daily_goal_30', icon: '💫', name: 'Azimli', desc: '30 gün hedefi tamamla', category: 'streak' },
  { id: 'level_5', icon: '⭐', name: 'Yıldız', desc: 'Seviye 5\'e ulaş', category: 'level' },
  { id: 'level_10', icon: '🌙', name: 'Dolunay', desc: 'Seviye 10\'a ulaş', category: 'level' },
  { id: 'level_15', icon: '☀️', name: 'Güneş', desc: 'Seviye 15\'e ulaş', category: 'level' },
  { id: 'combo_5', icon: '🔥', name: 'Sıcak Seri', desc: '5\'li combo yap', category: 'combo' },
  { id: 'combo_10', icon: '💥', name: 'Patlama', desc: '10\'lu combo yap', category: 'combo' },
  { id: 'combo_20', icon: '⚡', name: 'Şimşek', desc: '20\'li combo yap', category: 'combo' },
  { id: 'perfect_unit', icon: '💯', name: 'Mükemmel', desc: 'Bir üniteyi %100 bitir', category: 'learning' },
  { id: 'all_units', icon: '👑', name: 'YDT Şampiyonu', desc: 'Tüm üniteleri bitir', category: 'learning' },
  { id: 'first_custom', icon: '✏️', name: 'Kelime Ekleyen', desc: 'İlk özel kelime ekle', category: 'custom' },
  { id: 'custom_10', icon: '📝', name: 'Not Defteri', desc: '10 özel kelime ekle', category: 'custom' },
  { id: 'custom_50', icon: '📒', name: 'Defter', desc: '50 özel kelime ekle', category: 'custom' },
  { id: 'sr_review_100', icon: '🧠', name: 'Tekrar Ustası', desc: '100 tekrar yap', category: 'sr' },
  { id: 'freeze_first', icon: '❄️', name: 'Buz Kıran', desc: 'İlk streak freeze kullan', category: 'special' },
  { id: 'quest_complete_10', icon: '📋', name: 'Görevli', desc: '10 görev tamamla', category: 'quest' },
];

let _achievementData = JSON.parse(localStorage.getItem('ydt_achievements_v1') || '{"earned":[],"shown":[]}');

function _saveAchievements() { localStorage.setItem('ydt_achievements_v1', JSON.stringify(_achievementData)); }

function _isAchievementEarned(id) {
  return _achievementData.earned.includes(id);
}

function _markAchievementShown(id) {
  if (!_achievementData.shown.includes(id)) {
    _achievementData.shown.push(id);
    _saveAchievements();
  }
}

function getTotalLearned() {
  let total = 0;
  Object.values(progressRaw).forEach(arr => total += arr.length);
  return total;
}

function _checkAchievements() {
  const earned = _achievementData.earned;
  const checks = {
    first_word: getTotalLearned() >= 1,
    word_10: getTotalLearned() >= 10,
    word_50: getTotalLearned() >= 50,
    word_100: getTotalLearned() >= 100,
    word_500: getTotalLearned() >= 500,
    word_1000: getTotalLearned() >= 1000,
    streak_3: _streakData.streak >= 3,
    streak_7: _streakData.streak >= 7,
    streak_14: _streakData.streak >= 14,
    streak_30: _streakData.streak >= 30,
    streak_60: _streakData.streak >= 60,
    streak_100: _streakData.streak >= 100,
    streak_365: _streakData.streak >= 365,
    daily_goal_7: (_goalData.streakDays || 0) >= 7,
    daily_goal_30: (_goalData.streakDays || 0) >= 30,
    level_5: _getLevelForXP(_xpData.xp) >= 5,
    level_10: _getLevelForXP(_xpData.xp) >= 10,
    level_15: _getLevelForXP(_xpData.xp) >= 15,
    combo_5: _comboCount >= 5,
    combo_10: _comboCount >= 10,
    combo_20: _comboCount >= 20,
    perfect_unit: Object.keys(UNITS).some(u => getProgressPct(parseInt(u)) === 100),
    all_units: Object.keys(UNITS).every(u => getProgressPct(parseInt(u)) === 100),
    first_custom: customVocab.length >= 1,
    custom_10: customVocab.length >= 10,
    custom_50: customVocab.length >= 50,
    sr_review_100: Object.values(_srData).reduce((sum, c) => sum + (c.reps || 0), 0) >= 100,
    freeze_first: _streakFreezeUsed > 0,
    quest_complete_10: (_questData?.completedCount || 0) >= 10,
  };
  
  for (const [id, isEarned] of Object.entries(checks)) {
    if (isEarned && !earned.includes(id)) {
      earned.push(id);
      const achievement = ACHIEVEMENTS.find(a => a.id === id);
      if (achievement && !_achievementData.shown.includes(id)) {
        _showAchievementToast(achievement);
      }
    }
  }
  _saveAchievements();
}

function _showAchievementToast(achievement) {
  _markAchievementShown(achievement.id);
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `
    <div class="achievement-icon">${achievement.icon}</div>
    <div class="achievement-info">
      <div class="achievement-title">${achievement.name}</div>
      <div class="achievement-desc">${achievement.desc}</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function _renderAchievementsInStats(container) {
  const existing = container.querySelector('.gm-achievements-block');
  if (existing) existing.remove();
  
  const block = document.createElement('div');
  block.className = 'gm-achievements-block';
  
  const earned = _achievementData.earned;
  const total = ACHIEVEMENTS.length;
  const pct = Math.round((earned.length / total) * 100);
  
  const cats = ['learning', 'streak', 'level', 'combo', 'custom', 'sr', 'quest', 'special'];
  const catNames = { learning: '📚 Kelime', streak: '🔥 Seri', level: '⭐ Seviye', combo: '💥 Combo', custom: '✏️ Özel', sr: '🧠 SR', quest: '📋 Görev', special: '🏆 Özel' };
  
  let html = `
    <div class="gm-achievements-header">
      <div class="gm-achievements-title">🏆 Başarılar</div>
      <div class="gm-achievements-progress">${earned.length}/${total} (${pct}%)</div>
    </div>
    <div class="gm-achievements-grid">
  `;
  
  for (const ach of ACHIEVEMENTS) {
    const isEarned = earned.includes(ach.id);
    html += `<div class="gm-achievement-chip ${isEarned ? 'earned' : 'locked'}" title="${ach.desc}">
      <span class="gm-achievement-icon">${isEarned ? ach.icon : '🔒'}</span>
      <span class="gm-achievement-name">${ach.name}</span>
    </div>`;
  }
  
  html += '</div>';
  block.innerHTML = html;
  container.insertBefore(block, container.lastElementChild);
}

/* ────────────────────────────────────────────────────────────────
   DAILY QUEST SYSTEM
   ─────────────────────────────────────────────────────────────── */
const QUEST_TEMPLATES = [
  { id: 'cards_15', icon: '🃏', name: '15 Kart Çevir', desc: '15 flash kart çevir', xp: 25, check: (d) => (d.cardsFlipped || 0) >= 15 },
  { id: 'cards_30', icon: '🔥', name: '30 Kart Çevir', desc: '30 flash kart çevir', xp: 50, check: (d) => (d.cardsFlipped || 0) >= 30 },
  { id: 'mc_10', icon: '✅', name: '10 Doğru Test', desc: '10 doğru cevap testte', xp: 40, check: (d) => (d.mcCorrect || 0) >= 10 },
  { id: 'streak_protect', icon: '🛡️', name: 'Seriyi Koru', desc: 'Günlük hedefi tamamla', xp: 30, check: (d) => d.goalCompleted },
  { id: 'combo_5', icon: '💥', name: '5\'li Combo', desc: '5 doğru üst üste', xp: 20, check: (d) => d.combo5 },
  { id: 'learn_mode', icon: '📖', name: 'Sözlükçü', desc: 'Sözlük modunda 20 kelime bak', xp: 20, check: (d) => (d.wordsViewed || 0) >= 20 },
  { id: 'custom_add', icon: '✏️', name: 'Kelime Ekle', desc: '1 özel kelime ekle', xp: 15, check: (d) => d.customAdded },
  { id: 'sr_review', icon: '🧠', name: 'Tekrar Zamanı', desc: '5 spaced repetition tekrarı yap', xp: 25, check: (d) => (d.srReviews || 0) >= 5 },
  { id: 'all_modes', icon: '🎯', name: 'Çeşitli', desc: '3 farklı mod kullan', xp: 40, check: (d) => (d.modesUsed || 0) >= 3 },
  { id: 'fib_5', icon: '✏️', name: 'Yazarlar', desc: '5 boşluk doldur doğru', xp: 30, check: (d) => (d.fibCorrect || 0) >= 5 },
];

let _questData = JSON.parse(localStorage.getItem('ydt_quests_v1') || '{"date":"","active":[],"completed":[],"completedCount":0}');

function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function _initDailyQuests() {
  const today = _todayStr();
  if (_questData.date !== today) {
    const shuffled = [...QUEST_TEMPLATES].sort(() => Math.random() - 0.5);
    _questData = {
      date: today,
      active: shuffled.slice(0, 3),
      completed: [],
      completedCount: _questData.completedCount || 0,
      stats: { cardsFlipped: 0, mcCorrect: 0, wordsViewed: 0, srReviews: 0, fibCorrect: 0, modesUsed: new Set(), goalCompleted: false, combo5: false, customAdded: false }
    };
    _saveQuests();
  }
}

function _saveQuests() {
  const dataToSave = { ..._questData };
  if (dataToSave.stats?.modesUsed instanceof Set) {
    dataToSave.stats.modesUsed = [...dataToSave.stats.modesUsed];
  }
  localStorage.setItem('ydt_quests_v1', JSON.stringify(dataToSave));
}

function _checkQuests() {
  _initDailyQuests();
  for (const quest of _questData.active) {
    if (_questData.completed.includes(quest.id)) continue;
    if (quest.check(_questData.stats)) {
      _questData.completed.push(quest.id);
      _questData.completedCount++;
      _xpData.xp += quest.xp;
      _saveXP();
      _saveQuests();
      _showQuestComplete(quest);
      _checkAchievements();
    }
  }
}

function _showQuestComplete(quest) {
  const toast = document.createElement('div');
  toast.className = 'quest-complete-toast';
  toast.innerHTML = `
    <div class="quest-complete-icon">${quest.icon}</div>
    <div class="quest-complete-info">
      <div class="quest-complete-title">Görev Tamamlandı!</div>
      <div class="quest-complete-name">${quest.name}</div>
      <div class="quest-complete-xp">+${quest.xp} XP</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

function _renderQuestsInHome() {
  _initDailyQuests();
  const container = document.getElementById('quest-home-card');
  if (!container) return;
  
  const completed = _questData.completed.length;
  const total = _questData.active.length;
  
  container.innerHTML = `
    <div class="quest-header">
      <div class="quest-title">📋 Günlük Görevler</div>
      <div class="quest-progress">${completed}/${total}</div>
    </div>
    <div class="quest-list">
      ${_questData.active.map(q => {
        const isDone = _questData.completed.includes(q.id);
        return `<div class="quest-item ${isDone ? 'done' : ''}">
          <span class="quest-icon">${isDone ? '✅' : q.icon}</span>
          <span class="quest-name">${q.name}</span>
          <span class="quest-xp">+${q.xp} XP</span>
        </div>`;
      }).join('')}
    </div>
  `;
}

function _trackQuestStat(key, value = 1) {
  _initDailyQuests();
  if (_questData.stats[key] instanceof Set) {
    _questData.stats[key].add(value);
  } else if (typeof _questData.stats[key] === 'number') {
    _questData.stats[key] += value;
  } else if (typeof value === 'boolean') {
    _questData.stats[key] = value;
  }
  _saveQuests();
  _checkQuests();
}

/* ────────────────────────────────────────────────────────────────
   STREAK FREEZE SYSTEM
   ─────────────────────────────────────────────────────────────── */
let _streakFreezeAvailable = parseInt(localStorage.getItem('ydt_streak_freeze') || '0');
let _streakFreezeUsed = parseInt(localStorage.getItem('ydt_streak_freeze_used') || '0');

function _useStreakFreeze() {
  if (_streakFreezeAvailable <= 0) {
    showToast('❄️ Streak freeze hakkın yok!');
    return false;
  }
  _streakFreezeAvailable--;
  _streakFreezeUsed++;
  localStorage.setItem('ydt_streak_freeze', _streakFreezeAvailable);
  localStorage.setItem('ydt_streak_freeze_used', _streakFreezeUsed);
  _checkAchievements();
  return true;
}

function _earnStreakFreeze() {
  if (_streakData.streak > 0 && _streakData.streak % 30 === 0) {
    _streakFreezeAvailable++;
    localStorage.setItem('ydt_streak_freeze', _streakFreezeAvailable);
    showToast('❄️ +1 Streak Freeze kazandın!');
  }
}

function _canUseStreakFreeze() {
  return _streakFreezeAvailable > 0;
}

function _getStreakFreezeCount() {
  return _streakFreezeAvailable;
}

function _updateStreakWithFreeze() {
  const today = _todayStr();
  const last = _streakData.lastDate;
  
  if (last === today) return false;
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  
  if (last === yStr) {
    _streakData.streak++;
  } else if (last !== today) {
    if (_canUseStreakFreeze()) {
      _streakData.lastDate = today;
      _useStreakFreeze();
      showToast('❄️ Streak freeze kullanıldı! Serin korundu.');
      _saveStreak();
      return true;
    }
    _streakData.streak = 1;
  }
  
  _streakData.lastDate = today;
  if (_streakData.streak > (_streakData.longest || 0)) {
    _streakData.longest = _streakData.streak;
  }
  _saveStreak();
  _earnStreakFreeze();
  
  const badge = STREAK_BADGES.slice().reverse().find(b => _streakData.streak === b.days);
  if (badge) {
    setTimeout(() => _showStreakBadge(badge), 600);
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────
   LEVEL HELPERS
   ─────────────────────────────────────────────────────────────── */
function _getLevelForXP(xp) {
  let lvl = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) lvl = i;
    else break;
  }
  return lvl;
}

function _getXPProgress(xp) {
  const lvl = _getLevelForXP(xp);
  const cur = LEVEL_THRESHOLDS[lvl] || 0;
  const next = LEVEL_THRESHOLDS[lvl + 1];
  if (!next) return { pct: 100, current: xp - cur, needed: 0 };
  return {
    pct: Math.round(((xp - cur) / (next - cur)) * 100),
    current: xp - cur,
    needed: next - cur
  };
}

/* ────────────────────────────────────────────────────────────────
   STREAK LOGIC
   ─────────────────────────────────────────────────────────────── */
function _todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function _updateStreak() {
  const today = _todayStr();
  const last = _streakData.lastDate;

  if (last === today) return false; // zaten güncellendi

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  if (last === yStr) {
    _streakData.streak++;
  } else if (last !== today) {
    _streakData.streak = 1;
  }

  _streakData.lastDate = today;
  if (_streakData.streak > (_streakData.longest || 0)) {
    _streakData.longest = _streakData.streak;
  }
  _saveStreak();

  // Rozet kontrolü
  const badge = STREAK_BADGES.slice().reverse().find(b => _streakData.streak === b.days);
  if (badge) {
    setTimeout(() => _showStreakBadge(badge), 600);
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────
   XP KAZANMA  (ana entry point)
   ─────────────────────────────────────────────────────────────── */
function earnXP(type, anchorEl) {
  const baseAmount = XP_REWARDS[type] || 5;
  const prevLevel = _getLevelForXP(_xpData.xp);
  
  // Combo multiplier uygula
  const multiplier = _getComboMultiplier();
  const amount = Math.round(baseAmount * multiplier);
  const bonusXP = multiplier > 1 ? amount - baseAmount : 0;

  _xpData.xp += amount;
  const newLevel = _getLevelForXP(_xpData.xp);
  _saveXP();
  _updateStreakWithFreeze();
  _incrementGoal();

  // +XP balonu (combo bonus göster)
  if (anchorEl) {
    _showXPBubble(anchorEl, amount, bonusXP);
  }

  // Level-up?
  if (newLevel > prevLevel) {
    setTimeout(() => _showLevelUp(newLevel), 700);
  }

  // Combo artır
  _incrementCombo();
  _checkQuests();
  _checkAchievements();
  
  // HUD güncelle
  _renderHUD();
}

/* ────────────────────────────────────────────────────────────────
   CEVAP ANİMASYONLARI  (doğru / yanlış)
   ─────────────────────────────────────────────────────────────── */
function _triggerCorrect(anchorEl, xpType) {
  _spawnConfetti();
  earnXP(xpType || 'mc_correct', anchorEl);
}

function _triggerWrong(anchorEl) {
  _resetCombo();
  _shakeElement(anchorEl || document.getElementById('app'));
}

/* ────────────────────────────────────────────────────────────────
   GÜNLÜK HEDEF SİSTEMİ
   ─────────────────────────────────────────────────────────────── */
let _goalData = JSON.parse(localStorage.getItem('ydt_goal_v1') || '{"target":20,"today":"","count":0}');

function _todayGoalSync() {
  const today = _todayStr();
  if (_goalData.today !== today) {
    _goalData.today = today;
    _goalData.count = 0;
    _saveGoal();
  }
}

function _saveGoal() {
  localStorage.setItem('ydt_goal_v1', JSON.stringify(_goalData));
}

function _incrementGoal() {
  _todayGoalSync();
  _goalData.count = Math.min(_goalData.count + 1, _goalData.target * 2);
  _saveGoal();
  _renderGoalCard();
}

function _renderGoalCard() {
  const card = document.getElementById('gm-goal-card');
  if (!card) return;
  _todayGoalSync();
  const target = _goalData.target;
  const count = _goalData.count;
  const done = Math.min(count, target);
  const pct = Math.min(100, Math.round((done / target) * 100));
  const completed = count >= target;

  // SVG dairesel progress
  const r = 28, circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = completed ? '#2ecc71' : pct >= 60 ? '#f1c40f' : 'var(--accent)';

  card.innerHTML = `
    <div class="gm-goal-left">
      <svg class="gm-goal-ring" viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--border2)" stroke-width="5"/>
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="5"
          stroke-dasharray="${circ.toFixed(1)}"
          stroke-dashoffset="${offset.toFixed(1)}"
          stroke-linecap="round"
          transform="rotate(-90 32 32)"
          style="transition:stroke-dashoffset 0.6s ease,stroke 0.4s ease"/>
        <text x="32" y="36" text-anchor="middle" font-size="13" font-weight="800" fill="${color}">${pct}%</text>
      </svg>
    </div>
    <div class="gm-goal-mid">
      <div class="gm-goal-title">${completed ? '🎉 Hedef Tamamlandı!' : '🎯 Günlük Hedef'}</div>
      <div class="gm-goal-stat">${done} / ${target} kelime</div>
      <div class="gm-goal-bar-wrap">
        <div class="gm-goal-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>
    <button class="gm-goal-set-btn" onclick="openGoalModal()" title="Hedefi değiştir">⚙️</button>
  `;
}

function openGoalModal() {
  let modal = document.getElementById('gm-goal-modal');
  if (modal) { modal.remove(); return; }
  _todayGoalSync();
  const opts = [10, 20, 30, 50];
  modal = document.createElement('div');
  modal.id = 'gm-goal-modal';
  modal.className = 'gm-goal-modal-overlay';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="gm-goal-modal-card">
      <div class="gm-goal-modal-handle"></div>
      <div class="gm-goal-modal-title">🎯 Günlük Hedef Belirle</div>
      <div class="gm-goal-modal-sub">Bugün kaç kelime çalışmak istiyorsun?</div>
      <div class="gm-goal-opts">
        ${opts.map(n => `
          <button class="gm-goal-opt ${_goalData.target === n ? 'active' : ''}" onclick="setGoalTarget(${n})">
            <span class="gm-goal-opt-num">${n}</span>
            <span class="gm-goal-opt-lbl">kelime</span>
          </button>`).join('')}
      </div>
      <div class="gm-goal-custom-row">
        <span style="font-size:13px;color:var(--text3);font-weight:600">Özel:</span>
        <input class="gm-goal-custom-inp" id="gm-goal-custom" type="number" min="1" max="200"
          placeholder="${_goalData.target}" value="${_goalData.target}">
        <button class="gm-goal-custom-btn" onclick="setGoalTarget(parseInt(document.getElementById('gm-goal-custom').value)||20)">Ayarla</button>
      </div>
      <div class="gm-goal-progress-preview">
        <span style="font-size:12px;color:var(--text3)">Bugünkü ilerleme:</span>
        <span style="font-size:13px;font-weight:700;color:var(--accent)">${_goalData.count} kelime çalışıldı</span>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
}

function setGoalTarget(n) {
  if (!n || n < 1) return;
  _goalData.target = n;
  _saveGoal();
  const modal = document.getElementById('gm-goal-modal');
  if (modal) modal.remove();
  _renderGoalCard();
  showToast(`✓ Günlük hedef: ${n} kelime`);
}

/* ────────────────────────────────────────────────────────────────
   HUD  — artık header'a entegre, floating değil
   ─────────────────────────────────────────────────────────────── */
function _renderHUD() {
  // Eski floating HUD varsa kaldır
  const old = document.getElementById('gm-hud');
  if (old) old.remove();

  // Header info bar'ı güncelle (screen-home header'ındaki slot)
  _renderHeaderBar();
  // Hedef kartını güncelle
  _renderGoalCard();
}

function _renderHeaderBar() {
  let bar = document.getElementById('gm-header-bar');
  if (!bar) return; // HTML'de yok, çıkış

  const lvl = _getLevelForXP(_xpData.xp);
  const prog = _getXPProgress(_xpData.xp);
  const streak = _streakData.streak || 0;
  const streakHot = streak >= 3;

  bar.innerHTML = `
    <div class="gm-hb-streak ${streakHot ? 'hot' : ''}">
      <span class="gm-hb-streak-icon">${streakHot ? '🔥' : '📅'}</span>
      <span class="gm-hb-streak-num">${streak}</span>
    </div>
    <div class="gm-hb-xp">
      <div class="gm-hb-xp-top">
        <span class="gm-hb-lvl">Sv ${lvl}</span>
        <span class="gm-hb-xpnum">${_xpData.xp} XP</span>
      </div>
      <div class="gm-hb-bar-wrap">
        <div class="gm-hb-bar-fill" style="width:${prog.pct}%"></div>
      </div>
    </div>
  `;
}

/* ────────────────────────────────────────────────────────────────
   +XP BALONU
   ─────────────────────────────────────────────────────────────── */
function _showXPBubble(anchorEl, amount, bonusXP = 0) {
  const bubble = document.createElement('div');
  bubble.className = 'gm-xp-bubble';
  bubble.innerHTML = `+${amount} XP${bonusXP > 0 ? `<span class="xp-bonus">(+${bonusXP} combo)</span>` : ''}`;

  let rect;
  try { rect = anchorEl.getBoundingClientRect(); } catch (e) { return; }
  bubble.style.left = (rect.left + rect.width / 2) + 'px';
  bubble.style.top = (rect.top + window.scrollY - 10) + 'px';

  document.body.appendChild(bubble);
  requestAnimationFrame(() => bubble.classList.add('launch'));
  setTimeout(() => bubble.remove(), 1100);
}

/* ────────────────────────────────────────────────────────────────
   LEVEL-UP KUTLAMASI
   ─────────────────────────────────────────────────────────────── */
function _showLevelUp(level) {
  _spawnConfetti(80);

  const overlay = document.createElement('div');
  overlay.className = 'gm-levelup-overlay';
  overlay.innerHTML = `
      <div class="gm-levelup-card">
        <div class="gm-levelup-stars">✦ ✦ ✦</div>
        <div class="gm-levelup-label">SEVİYE ATLANDI!</div>
        <div class="gm-levelup-num">Seviye ${level}</div>
        <div class="gm-levelup-name">${LEVEL_NAMES[level] || 'Efsane'}</div>
        <div class="gm-levelup-xp">${_xpData.xp} XP</div>
        <button class="gm-levelup-btn" onclick="this.closest('.gm-levelup-overlay').remove()">Harika! 🎉</button>
      </div>
    `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
}

/* ────────────────────────────────────────────────────────────────
   STREAK ROZET BILDIRIMI
   ─────────────────────────────────────────────────────────────── */
function _showStreakBadge(badge) {
  const el = document.createElement('div');
  el.className = 'gm-streak-badge-toast';
  el.innerHTML = `
      <span class="gm-sb-icon" style="color:${badge.color}">${badge.icon}</span>
      <div>
        <div class="gm-sb-title">Seri Rozeti!</div>
        <div class="gm-sb-label">${badge.label}</div>
      </div>
    `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 500); }, 3500);
}

/* ────────────────────────────────────────────────────────────────
   CONFETTI
   ─────────────────────────────────────────────────────────────── */
function _spawnConfetti(count) {
  count = count || 40;
  const colors = ['#f1c40f', '#e74c3c', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22'];
  const container = document.getElementById('gm-confetti-layer') || (() => {
    const c = document.createElement('div');
    c.id = 'gm-confetti-layer';
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;overflow:hidden';
    document.body.appendChild(c);
    return c;
  })();

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 6 + Math.random() * 8;
    const left = Math.random() * 100;
    const delay = Math.random() * 400;
    const rot = Math.random() * 360;
    const shape = Math.random() > 0.5 ? '50%' : '2px';

    p.style.cssText = `
          position:absolute;
          left:${left}vw;
          top:-16px;
          width:${size}px;
          height:${size}px;
          background:${color};
          border-radius:${shape};
          opacity:1;
          transform:rotate(${rot}deg);
          animation: gm-fall ${0.8 + Math.random() * 0.8}s ${delay}ms cubic-bezier(0.25,0.46,0.45,0.94) forwards;
        `;
    container.appendChild(p);
    setTimeout(() => p.remove(), delay + 1600);
  }
}

/* ────────────────────────────────────────────────────────────────
   SHAKE  (yanlış cevap)
   ─────────────────────────────────────────────────────────────── */
function _shakeElement(el) {
  if (!el) return;
  el.classList.remove('gm-shake');
  void el.offsetWidth;
  el.classList.add('gm-shake');
  setTimeout(() => el.classList.remove('gm-shake'), 500);
}

/* ────────────────────────────────────────────────────────────────
   ÜNİTE BİTİŞ KUTLAMASI
   ─────────────────────────────────────────────────────────────── */
function _celebrateUnitComplete(unitNum) {
  _spawnConfetti(60);
  const el = document.createElement('div');
  el.className = 'gm-levelup-overlay';
  el.innerHTML = `
      <div class="gm-levelup-card" style="border-color:rgba(46,204,113,0.5)">
        <div class="gm-levelup-stars" style="color:#2ecc71">★ ★ ★</div>
        <div class="gm-levelup-label" style="color:#2ecc71">ÜNİTE TAMAMLANDI!</div>
        <div class="gm-levelup-num" style="font-size:28px">Ünite ${unitNum} ✓</div>
        <div class="gm-levelup-name">Tüm kelimeler öğrenildi</div>
        <button class="gm-levelup-btn" style="background:#2ecc71" onclick="this.closest('.gm-levelup-overlay').remove()">Süper! 🎊</button>
      </div>
    `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { if (el.parentNode) el.remove(); }, 5000);
}

/* ────────────────────────────────────────────────────────────────
   STATS PANELİNE XP/STREAK BÖLÜMÜ EKLE
   ─────────────────────────────────────────────────────────────── */
function _injectXPStats() {
  const container = document.getElementById('stats-content');
  if (!container) return;

  // Daha önce eklendiyse atlat
  if (container.querySelector('.gm-stats-block')) return;

  const lvl = _getLevelForXP(_xpData.xp);
  const prog = _getXPProgress(_xpData.xp);
  const streak = _streakData.streak || 0;
  const longest = _streakData.longest || 0;

  const badgesHtml = STREAK_BADGES.map(b => {
    const earned = longest >= b.days || streak >= b.days;
    return `<div class="gm-badge-chip ${earned ? 'earned' : ''}" title="${b.label}">
          <span>${b.icon}</span>
          <span class="gm-badge-days">${b.days}g</span>
        </div>`;
  }).join('');

  const block = document.createElement('div');
  block.className = 'gm-stats-block';
  block.innerHTML = `
      <div class="gm-stats-divider"></div>
      <div class="gm-stats-section-title">⚡ XP & Seviye</div>
      <div class="gm-stats-xp-row">
        <div class="gm-stats-xp-card">
          <div class="gm-stats-xp-level">Seviye ${lvl}</div>
          <div class="gm-stats-xp-name">${LEVEL_NAMES[lvl] || ''}</div>
          <div class="gm-stats-xp-total">${_xpData.xp} XP</div>
          <div class="gm-stats-bar-wrap">
            <div class="gm-stats-bar-fill" style="width:${prog.pct}%"></div>
          </div>
          <div class="gm-stats-bar-label">${prog.current} / ${prog.needed || '—'} XP</div>
        </div>
        <div class="gm-stats-streak-card">
          <div class="gm-stats-streak-num ${streak >= 3 ? 'hot' : ''}">${streak >= 3 ? '🔥' : '📅'} ${streak}</div>
          <div class="gm-stats-streak-label">günlük seri</div>
          <div class="gm-stats-streak-best">En uzun: ${longest} gün</div>
        </div>
      </div>
      <div class="gm-stats-section-title" style="margin-top:16px">🏅 Seri Rozetleri</div>
      <div class="gm-badge-row">${badgesHtml}</div>
    `;
  container.insertBefore(block, container.lastElementChild);
}

/* ────────────────────────────────────────────────────────────────
   APP.JS FONKSİYONLARINI YAMA  (monkey-patch)
   ─────────────────────────────────────────────────────────────── */

// -- logActivity: streak güncelle --
const _origLogActivity = window.logActivity;
window.logActivity = function () {
  if (_origLogActivity) _origLogActivity();
  _updateStreakWithFreeze();
  _trackQuestStat('modesUsed', 'activity');
  _renderHUD();
};

// -- markLearned: sözlükten öğrendim --
const _origMarkLearned = window.markLearned;
window.markLearned = function (unit, word) {
  _origMarkLearned(unit, word);
  earnXP('mark_learned', null);
  // Ünite tamamlandı mı?
  const pct = getProgressPct(unit);
  if (pct === 100) {
    setTimeout(() => _celebrateUnitComplete(unit), 400);
  }
};

// -- swipeCard: flash kart doğru/yanlış --
const _origSwipeCard = window.swipeCard;
window.swipeCard = function (dir) {
  const word = currentCards[cardIndex];
  const btn = dir === 'right'
    ? document.getElementById('btn-right')
    : document.getElementById('btn-wrong');

  if (dir === 'right') {
    earnXP('flash_correct', btn);
  } else {
    _shakeElement(document.getElementById('fc'));
  }
  _origSwipeCard(dir);
};

// -- MC doğru/yanlış --
const _origPickMC = window.pickMC;
window.pickMC = function (chosen, correct, meaning, backFn, titleOverride) {
  const btn = [...document.querySelectorAll('.mc-opt')].find(b => b.textContent.trim() === chosen);
  if (chosen === correct || chosen === meaning) {
    _triggerCorrect(btn, 'mc_correct');
  } else {
    _triggerWrong(btn);
  }
  _origPickMC(chosen, correct, meaning, backFn, titleOverride);
};

// -- FIB doğru/yanlış --
const _origCheckFIB = window.checkFIB;
window.checkFIB = function () {
  const inp = document.getElementById('fib-input');
  const answer = inp ? inp.value.trim().toLowerCase() : '';
  const correct = currentCards[cardIndex] ? currentCards[cardIndex][0].toLowerCase() : '';
  const isCorrect = answer === correct || answer === correct + 's' || correct === answer + 's'
    || answer === correct + 'd' || correct === answer + 'd';

  if (isCorrect) {
    _triggerCorrect(inp, 'fib_correct');
  } else {
    _triggerWrong(inp);
  }
  _origCheckFIB();
};

// -- Syn Quiz --
const _origPickSyn = window.pickSyn;
if (_origPickSyn) {
  window.pickSyn = function (chosen, correct, backFn) {
    const btns = document.querySelectorAll('.mc-opt');
    const btn = [...btns].find(b => b.textContent.trim() === chosen);
    if (chosen === correct) _triggerCorrect(btn, 'syn_correct');
    else _triggerWrong(btn);
    _origPickSyn(chosen, correct, backFn);
  };
}

// -- Ant Quiz --
const _origPickAnt = window.pickAnt;
if (_origPickAnt) {
  window.pickAnt = function (chosen, correct, backFn) {
    const btns = document.querySelectorAll('.mc-opt');
    const btn = [...btns].find(b => b.textContent.trim() === chosen);
    if (chosen === correct) _triggerCorrect(btn, 'ant_correct');
    else _triggerWrong(btn);
    _origPickAnt(chosen, correct, backFn);
  };
}

// -- PV Flash --
const _origSwipePV = window.swipePVCard;
if (_origSwipePV) {
  window.swipePVCard = function (dir) {
    if (dir === 'right') earnXP('pv_flash_correct', document.getElementById('btn-right'));
    else _shakeElement(document.getElementById('pv-fc'));
    _origSwipePV(dir);
  };
}

// -- showStats: XP bloğunu enjekte et --
const _origShowStats = window.showStats;
window.showStats = function () {
  _origShowStats();
  setTimeout(_injectXPStats, 50);
};

/* ────────────────────────────────────────────────────────────────
   CSS  (dinamik enjekte)
   ─────────────────────────────────────────────────────────────── */
const _gmStyles = `
/* ── KEYFRAMES ── */
@keyframes gm-fall {
  to { transform: translateY(105vh) rotate(720deg); opacity: 0; }
}
@keyframes gm-bubble {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-70px) scale(1.3); }
}
@keyframes gm-shake {
  0%,100% { transform: translateX(0); }
  15%      { transform: translateX(-8px) rotate(-1deg); }
  30%      { transform: translateX(8px)  rotate(1deg); }
  45%      { transform: translateX(-6px); }
  60%      { transform: translateX(6px); }
  75%      { transform: translateX(-3px); }
}
@keyframes gm-levelup-in {
  from { opacity: 0; transform: translateY(30px) scale(0.85); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}
@keyframes gm-hud-pulse {
  0%,100% { box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
  50%      { box-shadow: 0 4px 20px rgba(155,89,182,0.35); }
}
@keyframes gm-streak-slide {
  from { opacity: 0; transform: translateX(120%); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes gm-sb-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(120%); }
}
@keyframes gm-fire {
  0%,100% { transform: scaleY(1)   rotate(-3deg); }
  50%      { transform: scaleY(1.15) rotate(3deg); }
}

/* ── HEADER BAR (XP + Streak — header içi) ── */
#gm-header-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gm-hb-streak {
  display: flex;
  align-items: center;
  gap: 3px;
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: 20px;
  padding: 4px 8px;
}
.gm-hb-streak.hot {
  background: rgba(230,126,34,0.1);
  border-color: rgba(230,126,34,0.4);
}
.gm-hb-streak-icon {
  font-size: 15px;
  line-height: 1;
}
.gm-hb-streak.hot .gm-hb-streak-icon {
  display: inline-block;
  animation: gm-fire 0.7s ease-in-out infinite;
}
.gm-hb-streak-num {
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
}
.gm-hb-xp {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: 20px;
  padding: 4px 10px;
  min-width: 90px;
}
.gm-hb-xp-top {
  display: flex;
  align-items: center;
  gap: 5px;
}
.gm-hb-lvl {
  font-size: 10px;
  font-weight: 800;
  background: var(--accent);
  color: #fff;
  border-radius: 5px;
  padding: 1px 5px;
}
.gm-hb-xpnum {
  font-size: 11px;
  font-weight: 700;
  color: var(--text3);
}
.gm-hb-bar-wrap {
  width: 100%;
  height: 4px;
  background: var(--border2);
  border-radius: 4px;
  overflow: hidden;
}
.gm-hb-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #3498db);
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* ── GÜNLÜK HEDEF KARTI ── */
#gm-goal-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--card);
  border: 1px solid var(--border2);
  border-radius: 18px;
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}
.gm-goal-left { flex-shrink: 0; }
.gm-goal-ring { display: block; }
.gm-goal-mid {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.gm-goal-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.gm-goal-stat {
  font-size: 12px;
  font-weight: 600;
  color: var(--text3);
}
.gm-goal-bar-wrap {
  height: 5px;
  background: var(--border2);
  border-radius: 5px;
  overflow: hidden;
  margin-top: 2px;
}
.gm-goal-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease, background 0.4s ease;
}
.gm-goal-set-btn {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 7px 9px;
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s, border-color 0.2s;
}
.gm-goal-set-btn:hover { background: var(--surface); border-color: var(--accent); }

/* ── HEDEF MODAL ── */
.gm-goal-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 99990;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.25s ease;
}
.gm-goal-modal-overlay.show { opacity: 1; }
.gm-goal-modal-card {
  background: var(--card);
  border-radius: 24px 24px 0 0;
  padding: 8px 20px 36px;
  width: 100%;
  max-width: 520px;
  transform: translateY(40px);
  transition: transform 0.3s cubic-bezier(0.34,1.2,0.64,1);
}
.gm-goal-modal-overlay.show .gm-goal-modal-card { transform: translateY(0); }
.gm-goal-modal-handle {
  width: 36px; height: 4px;
  background: var(--border2);
  border-radius: 4px;
  margin: 10px auto 20px;
}
.gm-goal-modal-title {
  font-size: 18px; font-weight: 800; color: var(--text);
  margin-bottom: 4px;
}
.gm-goal-modal-sub {
  font-size: 13px; color: var(--text3);
  margin-bottom: 20px;
}
.gm-goal-opts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.gm-goal-opt {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px;
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: 14px;
  padding: 12px 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.gm-goal-opt:hover { border-color: var(--accent); background: var(--surface); }
.gm-goal-opt.active {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 4px 14px rgba(98,129,65,0.3);
}
.gm-goal-opt-num {
  font-size: 22px; font-weight: 900; color: var(--text);
  line-height: 1;
}
.gm-goal-opt.active .gm-goal-opt-num,
.gm-goal-opt.active .gm-goal-opt-lbl { color: #fff; }
.gm-goal-opt-lbl {
  font-size: 10px; font-weight: 600; color: var(--text3);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.gm-goal-custom-row {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 14px;
}
.gm-goal-custom-inp {
  flex: 1;
  background: var(--bg);
  border: 1.5px solid var(--border2);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 14px; font-weight: 700;
  color: var(--text);
  outline: none;
}
.gm-goal-custom-inp:focus { border-color: var(--accent); }
.gm-goal-custom-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-size: 13px; font-weight: 700;
  cursor: pointer;
}
.gm-goal-progress-preview {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 12px; padding: 10px 14px;
}

/* ── +XP BALONU ── */
.gm-xp-bubble {
  position: absolute;
  pointer-events: none;
  font-size: 14px;
  font-weight: 800;
  color: #f1c40f;
  text-shadow: 0 1px 4px rgba(0,0,0,.4);
  z-index: 99998;
  opacity: 0;
  white-space: nowrap;
  transform: translateX(-50%);
}
.gm-xp-bubble.launch {
  animation: gm-bubble 1s cubic-bezier(0.25,0.46,0.45,0.94) forwards;
}

/* ── SHAKE ── */
.gm-shake {
  animation: gm-shake 0.45s ease !important;
}

/* ── LEVEL-UP OVERLAY ── */
.gm-levelup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.65);
  z-index: 99995;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.gm-levelup-overlay.show { opacity: 1; }
.gm-levelup-card {
  background: var(--card, #fff);
  border: 2px solid rgba(155,89,182,0.4);
  border-radius: 24px;
  padding: 32px 28px 28px;
  text-align: center;
  max-width: 300px;
  width: 88vw;
  animation: gm-levelup-in 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;
  box-shadow: 0 20px 60px rgba(0,0,0,.3);
}
.gm-levelup-stars {
  font-size: 22px;
  color: #f1c40f;
  letter-spacing: 6px;
  margin-bottom: 8px;
}
.gm-levelup-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #9b59b6;
  margin-bottom: 6px;
}
.gm-levelup-num {
  font-size: 52px;
  font-weight: 900;
  line-height: 1;
  color: var(--text, #111);
  margin-bottom: 4px;
}
.gm-levelup-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text2, #555);
  margin-bottom: 6px;
}
.gm-levelup-xp {
  font-size: 13px;
  color: var(--text3, #999);
  margin-bottom: 20px;
}
.gm-levelup-btn {
  display: inline-block;
  background: #9b59b6;
  color: #fff;
  border: none;
  border-radius: 14px;
  padding: 12px 32px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
}
.gm-levelup-btn:active { transform: scale(0.96); opacity: 0.85; }

/* ── STREAK BADGE TOAST ── */
.gm-streak-badge-toast {
  position: fixed;
  right: 16px;
  top: 60px;
  z-index: 99990;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--card, #fff);
  border: 1px solid var(--border, #eee);
  border-radius: 16px;
  padding: 12px 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,.18);
  transform: translateX(120%);
  opacity: 0;
  transition: none;
}
.gm-streak-badge-toast.in {
  animation: gm-streak-slide 0.4s ease forwards;
}
.gm-streak-badge-toast:not(.in) {
  animation: gm-sb-out 0.4s ease forwards;
}
.gm-sb-icon {
  font-size: 28px;
  line-height: 1;
}
.gm-sb-title {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text3, #999);
}
.gm-sb-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text, #111);
}

/* ── STATS XP BLOCK ── */
.gm-stats-block { padding: 0 16px 20px; }
.gm-stats-divider { height: 1px; background: var(--border); margin-bottom: 20px; }
.gm-stats-section-title {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text3, #999);
  margin-bottom: 12px;
}
.gm-stats-xp-row {
  display: flex;
  gap: 10px;
}
.gm-stats-xp-card {
  flex: 1;
  background: rgba(155,89,182,0.07);
  border: 1px solid rgba(155,89,182,0.2);
  border-radius: 16px;
  padding: 14px;
}
.gm-stats-xp-level {
  font-size: 22px;
  font-weight: 900;
  color: #9b59b6;
}
.gm-stats-xp-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text2, #555);
  margin-bottom: 2px;
}
.gm-stats-xp-total {
  font-size: 11px;
  color: var(--text3, #999);
  margin-bottom: 8px;
}
.gm-stats-bar-wrap {
  height: 6px;
  background: var(--bg3, rgba(0,0,0,.08));
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 4px;
}
.gm-stats-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #9b59b6, #3498db);
  border-radius: 6px;
  transition: width 0.6s ease;
}
.gm-stats-bar-label {
  font-size: 10px;
  color: var(--text3, #999);
}
.gm-stats-streak-card {
  min-width: 90px;
  background: rgba(230,126,34,0.07);
  border: 1px solid rgba(230,126,34,0.2);
  border-radius: 16px;
  padding: 14px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.gm-stats-streak-num {
  font-size: 24px;
  font-weight: 900;
  color: var(--text, #111);
  line-height: 1.1;
}
.gm-stats-streak-num.hot { color: #e67e22; }
.gm-stats-streak-label { font-size: 11px; color: var(--text3, #999); margin-bottom: 4px; }
.gm-stats-streak-best { font-size: 10px; color: var(--text3, #999); }

/* ── STREAK BADGE ROW ── */
.gm-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.gm-badge-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1.5px dashed var(--border, #ddd);
  opacity: 0.3;
  transition: opacity 0.3s, border-color 0.3s, transform 0.2s;
  min-width: 44px;
  font-size: 18px;
}
.gm-badge-chip.earned {
  opacity: 1;
  border-style: solid;
  border-color: var(--accent, #9b59b6);
  box-shadow: 0 2px 8px rgba(155,89,182,0.2);
  transform: scale(1.05);
}
.gm-badge-days { font-size: 9px; font-weight: 700; color: var(--text3, #999); }
.gm-badge-chip.earned .gm-badge-days { color: var(--accent, #9b59b6); }
`;

const _styleEl = document.createElement('style');
_styleEl.textContent = _gmStyles;
document.head.appendChild(_styleEl);

/* ────────────────────────────────────────────────────────────────
   INIT
   ─────────────────────────────────────────────────────────────── */
(function _gmInit() {
  _updateStreakWithFreeze(); // ilk açılışta streak güncelle
  _todayGoalSync();
  _initDailyQuests();
  _renderHUD();

  // İlk günün streak bildirimini göster
  const today = _todayStr();
  const lastShownStreak = localStorage.getItem('ydt_streak_shown');
  if (_streakData.streak >= 3 && lastShownStreak !== today) {
    localStorage.setItem('ydt_streak_shown', today);
    setTimeout(() => {
      const badge = STREAK_BADGES.slice().reverse().find(b => _streakData.streak >= b.days);
      if (badge) _showStreakBadge(badge);
    }, 1500);
  }
})();

// Global erişim için
window.earnXP = earnXP;
window.gmTriggerCorrect = _triggerCorrect;
window.gmTriggerWrong = _triggerWrong;
window.gmSpawnConfetti = _spawnConfetti;
window.openGoalModal = openGoalModal;
window.setGoalTarget = setGoalTarget;

// ═══════════════════════════════════════════════════════════════
//  SPACED REPETITION — SM-2 Algoritması
//  Her kelime için: { ef, interval, reps, due }
//  ef        = ease factor (başlangıç: 2.5)
//  interval  = bir sonraki tekrara kadar gün sayısı
//  reps      = art arda doğru cevap sayısı
//  due       = "YYYY-MM-DD" formatında sonraki tekrar tarihi
// ═══════════════════════════════════════════════════════════════

/* ── STATE ── */
// _srData already declared at top
// { "abandon": { ef:2.5, interval:1, reps:0, due:"2024-01-01" }, ... }

function _srSave() {
  localStorage.setItem('ydt_sr_v1', JSON.stringify(_srData));
}

/* ── YARDIMCI ── */
function _srToday() {
  return new Date().toISOString().slice(0, 10);
}

function _srDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function _srGet(word) {
  return _srData[word] || { ef: 2.5, interval: 0, reps: 0, due: _srToday() };
}

/* ── SM-2 CORE ──
   q = 0..5 kalite notu
     5 = anında doğru
     4 = doğru (biraz düşününce)
     3 = doğru (zor)
     2 = yanlış ama çok kolayca hatırladı
     1 = yanlış
     0 = tamamen yanlış
   Biz için: doğru → q=4, yanlış → q=1
*/
function _sm2Update(word, q) {
  const card = _srGet(word);
  let { ef, interval, reps } = card;

  if (q >= 3) {
    // Doğru cevap
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 4;
    } else {
      interval = Math.round(interval * ef);
    }
    reps += 1;
  } else {
    // Yanlış cevap — sıfırla
    reps = 0;
    interval = 1;
  }

  // EF güncelle: EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;

  const due = _srDatePlusDays(interval);

  _srData[word] = { ef: parseFloat(ef.toFixed(3)), interval, reps, due };
  _srSave();
}

/* ── DOĞRU/YANLIŞ API ── */
function srMarkCorrect(word) {
  _sm2Update(word, 4);
  _srUpdateHomeCard();
}

function srMarkHard(word) {
  _sm2Update(word, 2);
  _srUpdateHomeCard();
}

function srMarkWrong(word) {
  _sm2Update(word, 1);
  _srUpdateHomeCard();
}

/* ── BUGÜNKÜ KUYRUK ── */
function _srGetDueWords() {
  const today = _srToday();
  const due = [];

  for (let u = 1; u <= 10; u++) {
    UNITS[u].words.forEach(w => {
      const word = w[0];
      const card = _srGet(word);
      // Hiç çalışılmamış (interval=0 ve reps=0) kelimeler hariç —
      // sadece en az bir kez görülmüş kelimeler kuyruğa girer.
      // Tamamen yeni kelimeler SR ekranında değil normal modda tanıtılır.
      if (card.reps > 0 && card.due <= today) {
        due.push({ wordArr: w, unit: u, card });
      }
    });
  }

  // Önce en gecikmiş, sonra en düşük EF (en zor)
  due.sort((a, b) => {
    const daysDiffA = _srDaysDiff(a.card.due, today);
    const daysDiffB = _srDaysDiff(b.card.due, today);
    if (daysDiffB !== daysDiffA) return daysDiffB - daysDiffA;
    return a.card.ef - b.card.ef;
  });

  return due;
}

function _srDaysDiff(dateStr, today) {
  const a = new Date(dateStr), b = new Date(today);
  return Math.round((b - a) / 86400000);
}

/* ── YENİ KELİMELER (SR'ye girmemiş) ── */
function _srGetNewWords(limit) {
  const newWords = [];
  for (let u = 1; u <= 10; u++) {
    UNITS[u].words.forEach(w => {
      const card = _srGet(w[0]);
      if (card.reps === 0) {
        newWords.push({ wordArr: w, unit: u, card });
      }
    });
  }
  // Önce üniteye göre sırala, ilk ünite önce gelsin
  newWords.sort((a, b) => a.unit - b.unit);
  return newWords.slice(0, limit || 10);
}

/* ── HOME KART RENDER ── */
function _srUpdateHomeCard() {
  const card = document.getElementById('sr-home-card');
  if (!card) return;

  const due = _srGetDueWords();
  const newWords = _srGetNewWords(5);
  const total = due.length;
  const newCount = newWords.length;
  const today = _srToday();

  // Bugün tamamlanan tekrar sayısını hesapla
  const doneToday = Object.values(_srData).filter(c => {
    // Son güncelleme bugünden sonra ise bugün çalışıldı demektir
    return c.due > today && c.reps > 0;
  }).length;

  if (total === 0 && newCount === 0) {
    card.innerHTML = `
      <div class="sr-card-done">
        <span class="sr-card-done-icon">🎉</span>
        <div>
          <div class="sr-card-title">Günlük Tekrarlar Tamam!</div>
          <div class="sr-card-sub">Bugün ${doneToday} kelime tekrar ettin</div>
        </div>
      </div>`;
    return;
  }

  const urgentCount = due.filter(d => _srDaysDiff(d.card.due, today) >= 1).length;

  card.innerHTML = `
    <div class="sr-card-header">
      <div class="sr-card-icon-wrap">
        <span class="sr-card-icon">🧠</span>
      </div>
      <div class="sr-card-info">
        <div class="sr-card-title">Tekrar Zamanı</div>
        <div class="sr-card-chips">
          ${total > 0 ? `<span class="sr-chip due">${total} tekrar</span>` : ''}
          ${newCount > 0 ? `<span class="sr-chip new">${newCount} yeni</span>` : ''}
          ${urgentCount > 0 ? `<span class="sr-chip urgent">⚠ ${urgentCount} gecikmiş</span>` : ''}
        </div>
      </div>
    </div>
    <div class="sr-card-actions">
      <button class="sr-btn primary" onclick="startSRSession()">▶ Çalışmaya Başla</button>
      <button class="sr-btn outline" onclick="showSRStats()">📊 Detay</button>
    </div>
  `;
}

/* ── SR OTURUMU BAŞLAT ── */
function startSRSession() {
  const due = _srGetDueWords();
  const newWords = _srGetNewWords(10 - Math.min(due.length, 10));

  // Miktar sınırla: max 20 kart / oturum
  const reviewCards = due.slice(0, 15).map(d => {
    const w = [...d.wordArr];
    w._unit = d.unit;
    w._sr = true;
    w._srWord = d.wordArr[0];
    return w;
  });

  const newCards = newWords.slice(0, 5).map(d => {
    const w = [...d.wordArr];
    w._unit = d.unit;
    w._sr = true;
    w._srNew = true;
    w._srWord = d.wordArr[0];
    return w;
  });

  const allCards = shuffle([...reviewCards, ...newCards]);

  if (allCards.length === 0) {
    showToast('Bugün çalışılacak kelime yok!');
    return;
  }

  // SR modunu flash card olarak başlat
  currentCards = allCards;
  cardIndex = 0; known = []; unknown = [];
  renderSRFlash();
  showScreen('screen-flash');
}

/* ── SR FLASH RENDER ── */
function renderSRFlash() {
  const s = document.getElementById('screen-flash');
  if (cardIndex >= currentCards.length) {
    renderSRResult();
    return;
  }

  const word = currentCards[cardIndex];
  const total = currentCards.length;
  const pct = Math.round((cardIndex / total) * 100);
  const card = _srGet(word._srWord || word[0]);
  const isNew = word._srNew;
  const daysOverdue = isNew ? 0 : _srDaysDiff(card.due, _srToday());

  // Interval etiketi
  const intervalLabel = isNew
    ? '<span class="sr-badge new-badge">✨ Yeni</span>'
    : daysOverdue > 0
      ? `<span class="sr-badge overdue-badge">⚠ ${daysOverdue}g gecikmiş</span>`
      : `<span class="sr-badge review-badge">🔄 Tekrar</span>`;

  s.innerHTML = `
  <div class="unit-header">
    <button class="back-btn" onclick="goHome()">←</button>
    <div>
      <div class="unit-title-h">🧠 Tekrar Modu</div>
      <div class="unit-sub">Ünite ${word._unit} · ${cardIndex + 1}/${total}</div>
    </div>
    <div style="font-size:11px;color:var(--text3);font-weight:600">${known.length}✓ ${unknown.length}✗</div>
  </div>
  <div class="flash-wrap">
    <div class="flash-progress-row">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="flash-counter-badge">${cardIndex + 1}/${total}</span>
    </div>
    <div class="flash-card-wrap">
      <div class="flash-card" id="fc">
        <div class="swipe-overlay left" id="fc-overlay-left">
          <div class="swipe-overlay-icon">✗</div>
          <div class="swipe-overlay-label">Bilmedim</div>
        </div>
        <div class="swipe-overlay right" id="fc-overlay-right">
          <div class="swipe-overlay-icon">✓</div>
          <div class="swipe-overlay-label">Bildim</div>
        </div>
        <div class="flash-face flash-front">
          <span class="flash-unit-badge">Ünite ${word._unit}</span>
          ${intervalLabel}
          <div class="flash-tap-icon">👆</div>
          <div class="flash-hint">İngilizce</div>
          <div class="flash-word">${esc(word[0])}</div>
          <div class="flash-hint-bottom">Ortaya dokun — kartı çevir</div>
        </div>
        <div class="flash-face flash-back">
          <div class="flash-hint" style="color:rgba(255,255,255,0.7)">Türkçe</div>
          <div class="flash-meaning">${esc(word[1])}</div>
          ${word[2] ? `<div class="flash-example">"${esc(word[2])}"</div>` : ''}
          <div class="sr-quality-row">
            <button class="sr-q-btn hard" onclick="srSwipe('hard')">😓 Zor</button>
            <button class="sr-q-btn good" onclick="srSwipe('good')">😊 Bildim</button>
            <button class="sr-q-btn easy" onclick="srSwipe('easy')">😎 Kolay</button>
          </div>
        </div>
      </div>
    </div>
    <div class="flash-swipe-guide">
      <div class="flash-guide-item"><div class="flash-guide-dot" style="background:var(--error)"></div><span style="color:var(--error)">← Bilmedim</span></div>
      <span style="font-size:10px;color:var(--text3)">sürükle veya bas</span>
      <div class="flash-guide-item"><span style="color:var(--success)">Bildim →</span><div class="flash-guide-dot" style="background:var(--success)"></div></div>
    </div>
    <div class="swipe-btn-row">
      <button class="swipe-btn wrong" id="btn-wrong" onclick="srSwipe('wrong')">✗ Bilmedim</button>
      <button class="swipe-btn right" id="btn-right" onclick="srSwipe('good')">✓ Bildim</button>
    </div>
  </div>`;

  initFlashDrag();
}

/* ── SR SWIPE ── */
function srSwipe(quality) {
  const fc = document.getElementById('fc');
  if (!fc) return;

  const word = currentCards[cardIndex];
  const wordKey = word._srWord || word[0];
  const unit = word._unit || currentUnit;

  // SM-2 güncelle
  let q;
  if (quality === 'easy') q = 5;
  else if (quality === 'good') q = 4;
  else if (quality === 'hard') q = 2;
  else q = 1; // wrong

  _sm2Update(wordKey, q);

  // Görsel animasyon
  const isRight = q >= 3;
  fc.classList.remove('dragging');
  fc.style.transition = 'transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.38s ease';
  const baseFlip = fc.classList.contains('flipped') ? ' rotateY(180deg)' : '';
  fc.style.transform = isRight
    ? `translateX(110vw) rotate(22deg)${baseFlip}`
    : `translateX(-110vw) rotate(-22deg)${baseFlip}`;
  fc.style.opacity = '0';

  // Progress ve errorBox güncelle
  if (isRight) {
    known.push(word);
    markLearned(unit, word[0]);
    delete errorBox['u' + unit + '_' + word[0]];
    saveErrors();
    if (typeof earnXP === 'function') earnXP('flash_correct', document.getElementById('btn-right'));
  } else {
    unknown.push(word);
    errorBox['u' + unit + '_' + word[0]] = { word: word[0], meaning: word[1], unit };
    saveErrors();
  }

  setTimeout(() => {
    cardIndex++;
    renderSRFlash();
  }, 380);
}

/* ── SR SONUÇ ── */
function renderSRResult() {
  const s = document.getElementById('screen-flash');
  const total = known.length + unknown.length;
  const pct = total > 0 ? Math.round((known.length / total) * 100) : 0;

  // Sonraki tekrar sürelerini göster
  const nextReviews = currentCards.slice(0, 5).map(w => {
    const card = _srGet(w._srWord || w[0]);
    return { word: w[0], interval: card.interval, due: card.due };
  });

  const nextHtml = nextReviews.map(r => `
    <div class="sr-result-row">
      <span class="sr-result-word">${esc(r.word)}</span>
      <span class="sr-result-next">${r.interval === 1 ? 'Yarın' : r.interval + ' gün sonra'}</span>
    </div>`).join('');

  s.innerHTML = `
  <div class="result-wrap" style="overflow-y:auto">
    <div class="result-emoji">${pct >= 80 ? '🏆' : pct >= 50 ? '💪' : '📚'}</div>
    <div class="result-title">${pct >= 80 ? 'Harika!' : pct >= 50 ? 'İyi İş!' : 'Devam Et!'}</div>
    <div class="result-sub">${total} karttan ${known.length} doğru · ${pct}% başarı</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num" style="color:var(--success)">${known.length}</div><div class="stat-lbl">Bildim ✓</div></div>
      <div class="stat-box"><div class="stat-num" style="color:var(--error)">${unknown.length}</div><div class="stat-lbl">Bilmedim ✗</div></div>
    </div>
    <div class="sr-next-wrap">
      <div class="sr-next-title">📅 Sonraki tekrar tarihleri</div>
      ${nextHtml}
    </div>
    <button class="result-btn" onclick="startSRSession()">🔄 Devam Et</button>
    <button class="result-btn outline" onclick="goHome()">Ana Sayfa</button>
  </div>`;

  _srUpdateHomeCard();
}

/* ── SR İSTATİSTİK DETAY ── */
function showSRStats() {
  const due = _srGetDueWords();
  const today = _srToday();
  const allSR = Object.entries(_srData);

  // Olgunluk dağılımı
  const buckets = { new: 0, learning: 0, young: 0, mature: 0 };
  for (let u = 1; u <= 10; u++) {
    UNITS[u].words.forEach(w => {
      const c = _srGet(w[0]);
      if (c.reps === 0) buckets.new++;
      else if (c.interval <= 1) buckets.learning++;
      else if (c.interval <= 7) buckets.young++;
      else buckets.mature++;
    });
  }

  // Önümüzdeki 7 günün tahmini yükü
  const forecast = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = allSR.filter(([, c]) => c.due === dateStr && c.reps > 0).length;
    const label = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : d.toLocaleDateString('tr-TR', { weekday: 'short' });
    forecast.push({ label, count, dateStr });
  }

  const maxForecast = Math.max(...forecast.map(f => f.count), 1);

  let modal = document.getElementById('sr-stats-modal');
  if (modal) { modal.remove(); return; }

  modal = document.createElement('div');
  modal.id = 'sr-stats-modal';
  modal.className = 'gm-goal-modal-overlay';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="gm-goal-modal-card" style="max-height:85vh;overflow-y:auto;padding-bottom:40px">
      <div class="gm-goal-modal-handle"></div>
      <div class="gm-goal-modal-title">🧠 Spaced Repetition</div>
      <div class="gm-goal-modal-sub">SM-2 algoritması ile kişiselleştirilmiş tekrar programı</div>

      <!-- Olgunluk dağılımı -->
      <div class="sr-stats-section">
        <div class="sr-stats-section-title">Kelime Olgunluğu</div>
        <div class="sr-maturity-row">
          <div class="sr-maturity-chip" style="background:rgba(52,152,219,0.12);border-color:rgba(52,152,219,0.3)">
            <div class="sr-maturity-num" style="color:#3498db">${buckets.new}</div>
            <div class="sr-maturity-lbl">Yeni</div>
          </div>
          <div class="sr-maturity-chip" style="background:rgba(230,126,34,0.1);border-color:rgba(230,126,34,0.3)">
            <div class="sr-maturity-num" style="color:#e67e22">${buckets.learning}</div>
            <div class="sr-maturity-lbl">Öğreniliyor</div>
          </div>
          <div class="sr-maturity-chip" style="background:rgba(241,196,15,0.1);border-color:rgba(241,196,15,0.35)">
            <div class="sr-maturity-num" style="color:#f1c40f">${buckets.young}</div>
            <div class="sr-maturity-lbl">Genç</div>
          </div>
          <div class="sr-maturity-chip" style="background:rgba(46,204,113,0.1);border-color:rgba(46,204,113,0.3)">
            <div class="sr-maturity-num" style="color:#2ecc71">${buckets.mature}</div>
            <div class="sr-maturity-lbl">Olgun</div>
          </div>
        </div>
      </div>

      <!-- 7 günlük tahmin -->
      <div class="sr-stats-section">
        <div class="sr-stats-section-title">Önümüzdeki 7 Gün</div>
        <div class="sr-forecast-wrap">
          ${forecast.map(f => `
            <div class="sr-forecast-col">
              <div class="sr-forecast-bar-wrap">
                <div class="sr-forecast-bar" style="height:${Math.max(4, Math.round((f.count / maxForecast) * 60))}px;background:${f.label === 'Bugün' ? 'var(--accent)' : 'var(--border2)'}"></div>
              </div>
              <div class="sr-forecast-num" style="color:${f.label === 'Bugün' ? 'var(--accent)' : 'var(--text3)'}">${f.count}</div>
              <div class="sr-forecast-label" style="color:${f.label === 'Bugün' ? 'var(--accent)' : 'var(--text3)'}">${f.label}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Bekleyen kelimeler listesi -->
      ${due.length > 0 ? `
      <div class="sr-stats-section">
        <div class="sr-stats-section-title">Bekleyen Tekrarlar (${due.length})</div>
        <div class="sr-due-list">
          ${due.slice(0, 10).map(d => {
    const overdue = _srDaysDiff(d.card.due, today);
    return `
            <div class="sr-due-row">
              <div>
                <span class="sr-due-word">${esc(d.wordArr[0])}</span>
                <span class="sr-due-meaning">${esc(d.wordArr[1])}</span>
              </div>
              <div style="text-align:right">
                <div class="sr-due-interval">her ${d.card.interval}g</div>
                ${overdue > 0 ? `<div style="font-size:10px;color:var(--error)">${overdue}g gecikmiş</div>` : ''}
              </div>
            </div>`;
  }).join('')}
          ${due.length > 10 ? `<div style="text-align:center;font-size:12px;color:var(--text3);padding:8px">+${due.length - 10} kelime daha</div>` : ''}
        </div>
      </div>` : ''}

      <button class="sr-btn primary" style="width:100%;margin-top:8px" onclick="document.getElementById('sr-stats-modal').remove();startSRSession()">▶ Çalışmaya Başla</button>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
}

/* ── HOME KARTINI renderHome'a bağla ── */
const _origRenderHome = window.renderHome || renderHome;
// renderHome zaten app.js içinde çağrılıyor, _srUpdateHomeCard inject ediliyor
// aşağıdaki patch renderHome'u wrap'ler
(function _patchRenderHome() {
  const orig = renderHome;
  window.renderHome = function () {
    orig();
    _srUpdateHomeCard();
  };
  renderHome = window.renderHome;
})();

/* ── markLearned / markUnlearned PATCH (SR tetikle) ── */
// Gamification zaten markLearned'ı patch'ledi; biz window.markLearned'ı üst üste yazıyoruz
const _srOrigMarkLearned = window.markLearned;
window.markLearned = function (unit, word) {
  _srOrigMarkLearned(unit, word);
  // Eğer SR kaydı yoksa (yeni kelime) SR'ye başlat — ilk kez öğrenildi
  const existing = _srData[word];
  if (!existing || existing.reps === 0) {
    _sm2Update(word, 3); // İlk görme: interval=1, q=3
  }
  _srUpdateHomeCard();
};

const _srOrigMarkUnlearned = window.markUnlearned;
window.markUnlearned = function (unit, word) {
  if (_srOrigMarkUnlearned) _srOrigMarkUnlearned(unit, word);
  // Bilmedikçe SM-2'de geri sar
  if (_srData[word] && _srData[word].reps > 0) {
    _sm2Update(word, 1);
  }
  _srUpdateHomeCard();
};

/* ── CSS ── */
const _srStyles = `
/* ── SR HOME KARTI ── */
#sr-home-card {
  background: linear-gradient(135deg, rgba(var(--accent-rgb,98,129,65),0.08), rgba(52,152,219,0.06));
  border: 1px solid var(--border2);
  border-radius: 18px;
  padding: 14px 16px;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}
.sr-card-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
}
.sr-card-icon-wrap {
  width: 44px; height: 44px;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; flex-shrink: 0;
}
.sr-card-info { flex: 1; }
.sr-card-title {
  font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 5px;
}
.sr-card-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.sr-chip {
  font-size: 11px; font-weight: 700;
  border-radius: 20px; padding: 2px 9px;
}
.sr-chip.due   { background: rgba(155,89,182,0.12); color: #9b59b6; border: 1px solid rgba(155,89,182,0.25); }
.sr-chip.new   { background: rgba(52,152,219,0.12); color: #3498db; border: 1px solid rgba(52,152,219,0.25); }
.sr-chip.urgent{ background: rgba(231,76,60,0.1);   color: var(--error); border: 1px solid rgba(231,76,60,0.25); }
.sr-card-actions { display: flex; gap: 8px; }
.sr-btn {
  flex: 1; border-radius: 12px; padding: 10px 12px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: all 0.2s;
}
.sr-btn.primary {
  background: var(--accent); color: #fff; border: none;
  box-shadow: 0 4px 12px rgba(98,129,65,0.3);
}
.sr-btn.primary:hover { filter: brightness(1.08); }
.sr-btn.outline {
  background: var(--surface); color: var(--text2);
  border: 1px solid var(--border2);
}
.sr-btn.outline:hover { border-color: var(--accent); color: var(--accent); }
.sr-card-done {
  display: flex; align-items: center; gap: 12px;
}
.sr-card-done-icon { font-size: 28px; flex-shrink: 0; }

/* ── SR FLASH BADGE ── */
.sr-badge {
  display: inline-block; font-size: 10px; font-weight: 700;
  border-radius: 20px; padding: 2px 9px; margin-bottom: 6px;
  letter-spacing: 0.3px;
}
.new-badge     { background: rgba(52,152,219,0.18); color: #3498db; }
.review-badge  { background: rgba(155,89,182,0.15); color: #9b59b6; }
.overdue-badge { background: rgba(231,76,60,0.13); color: var(--error); }

/* ── SR FLASH KALİTE BUTONLARI ── */
.sr-quality-row {
  display: flex; gap: 8px; margin-top: 16px;
  justify-content: center;
}
.sr-q-btn {
  flex: 1; max-width: 90px; padding: 8px 4px;
  border-radius: 12px; font-size: 12px; font-weight: 700;
  cursor: pointer; border: none; transition: all 0.2s;
}
.sr-q-btn.hard {
  background: rgba(231,76,60,0.13); color: var(--error);
  border: 1px solid rgba(231,76,60,0.25);
}
.sr-q-btn.good {
  background: rgba(46,204,113,0.13); color: var(--success);
  border: 1px solid rgba(46,204,113,0.3);
}
.sr-q-btn.easy {
  background: rgba(52,152,219,0.12); color: #3498db;
  border: 1px solid rgba(52,152,219,0.25);
}
.sr-q-btn:active { transform: scale(0.94); }

/* ── SR SONUÇ ── */
.sr-next-wrap {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 14px; padding: 12px 14px; margin: 12px 0;
  width: 100%; max-width: 340px;
}
.sr-next-title {
  font-size: 11px; font-weight: 700; color: var(--text3);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.sr-result-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 0; border-bottom: 1px solid var(--border);
}
.sr-result-row:last-child { border-bottom: none; }
.sr-result-word { font-size: 13px; font-weight: 700; color: var(--text); }
.sr-result-next { font-size: 11px; color: var(--accent); font-weight: 600; }

/* ── SR İSTATİSTİK MODAL ── */
.sr-stats-section { margin-bottom: 20px; }
.sr-stats-section-title {
  font-size: 11px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.8px; color: var(--text3); margin-bottom: 10px;
}
.sr-maturity-row {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 8px;
}
.sr-maturity-chip {
  border-radius: 14px; padding: 10px 6px; text-align: center;
  border: 1px solid var(--border);
}
.sr-maturity-num { font-size: 22px; font-weight: 900; line-height: 1; }
.sr-maturity-lbl { font-size: 10px; color: var(--text3); margin-top: 2px; font-weight: 600; }

.sr-forecast-wrap {
  display: flex; align-items: flex-end; gap: 6px;
  height: 90px; padding-bottom: 0;
}
.sr-forecast-col {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end; gap: 3px;
}
.sr-forecast-bar-wrap {
  display: flex; align-items: flex-end; height: 60px;
}
.sr-forecast-bar {
  width: 20px; border-radius: 5px 5px 0 0;
  transition: height 0.4s ease;
}
.sr-forecast-num  { font-size: 11px; font-weight: 700; }
.sr-forecast-label{ font-size: 9px; font-weight: 600; text-transform: uppercase; }

.sr-due-list {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 14px; overflow: hidden;
}
.sr-due-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 12px; border-bottom: 1px solid var(--border);
}
.sr-due-row:last-child { border-bottom: none; }
.sr-due-word { font-size: 13px; font-weight: 700; color: var(--text); margin-right: 8px; }
.sr-due-meaning { font-size: 11px; color: var(--text3); }
.sr-due-interval { font-size: 10px; color: var(--text3); font-weight: 600; }
`;

const _srStyleEl = document.createElement('style');
_srStyleEl.textContent = _srStyles;
document.head.appendChild(_srStyleEl);

/* ── INIT ── */
window.startSRSession = startSRSession;
window.showSRStats = showSRStats;
window.srSwipe = srSwipe;

// ═══════════════════════════════════════════════════════════════
//  HIZ MODU  —  CSS-animation tabanlı geri sayım, JS-light
//  SVG stroke-dashoffset CSS @keyframes ile drive edilir.
//  Tek JS görevi: timeout anında tetiklemek + renk değişimi.
// ═══════════════════════════════════════════════════════════════

const SPEED_TIME = 10;
const SPEED_BONUS_TIME = 5;
const SPEED_XP_NORMAL = 12;
const SPEED_XP_BONUS = 20;

let _spCards = [], _spIdx = 0, _spScore = 0, _spTotal = 0;
let _spTimeout = null, _spInterval = null, _spStart = 0, _spAnswered = false;
const CIRC = 2 * Math.PI * 18; // ~113.1

function startSpeedMode() {
  _spCards = shuffle(UNITS[currentUnit].words);
  _spIdx = 0; _spScore = 0; _spTotal = _spCards.length;
  _spAnswered = false;
  showScreen('screen-speed');
  _renderSpeedQ();
}

function _clearSpeedTimer() {
  if (_spTimeout) { clearTimeout(_spTimeout); _spTimeout = null; }
  if (_spInterval) { clearInterval(_spInterval); _spInterval = null; }
}

function _timeLeftNow() {
  return Math.max(0, SPEED_TIME - (Date.now() - _spStart) / 1000);
}

function _startTimerTick() {
  // Her 50ms'de bir halka + sayıyı güncelle
  _spInterval = setInterval(() => {
    const left = _timeLeftNow();
    const arc = document.querySelector('.sp-arc');
    const num = document.getElementById('speed-timer-num');
    if (arc) {
      const offset = CIRC * (1 - left / SPEED_TIME);
      arc.style.strokeDashoffset = offset;
      // Renk: yeşil → sarı → kırmızı
      if (left > SPEED_TIME * 0.6) arc.style.stroke = '#2ecc71';
      else if (left > SPEED_TIME * 0.35) arc.style.stroke = '#f39c12';
      else if (left > SPEED_TIME * 0.25) arc.style.stroke = '#e67e22';
      else arc.style.stroke = '#e74c3c';
    }
    if (num) {
      num.textContent = Math.ceil(left);
      // Son 3 saniye: pulse efekti
      if (left <= 3 && left > 0) num.classList.add('sp-urgent');
      else num.classList.remove('sp-urgent');
    }
    if (left <= 0) _clearSpeedTimer();
  }, 50);
}

function _renderSpeedQ() {
  _clearSpeedTimer();
  const s = document.getElementById('screen-speed');
  if (_spIdx >= _spCards.length) { _renderSpeedResult(); return; }

  const word = _spCards[_spIdx];
  const unit = word._unit || currentUnit;
  const allWords = UNITS[unit] ? UNITS[unit].words : Object.values(UNITS).flatMap(u => u.words);
  const wrong = shuffle(allWords.filter(w => w[0] !== word[0])).slice(0, 3);
  const opts = shuffle([word, ...wrong]);
  const pct = Math.round((_spIdx / _spTotal) * 100);
  _spAnswered = false;

  s.innerHTML = `
  <div class="unit-header">
    <button class="back-btn" onclick="_clearSpeedTimer();openUnit(${currentUnit})">←</button>
    <div>
      <div class="unit-title-h" style="color:#e74c3c">⏱️ Hız Modu</div>
      <div class="unit-sub">Ünite ${currentUnit} · ${_spIdx + 1}/${_spTotal}</div>
    </div>
    <div class="speed-timer-wrap">
      <svg class="speed-timer-ring" viewBox="0 0 44 44">
        <circle class="sp-track" cx="22" cy="22" r="18"/>
        <circle class="sp-arc"   cx="22" cy="22" r="18"/>
      </svg>
      <div class="speed-timer-num" id="speed-timer-num">${SPEED_TIME}</div>
    </div>
  </div>
  <div class="mc-wrap">
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="speed-xp-hint" id="speed-xp-hint">⚡ ${SPEED_BONUS_TIME}+ saniye kalırsa <b>+${SPEED_XP_BONUS} Bonus XP</b></div>
    <div class="mc-question">
      <div class="mc-q-label">Aşağıdaki Kelimenin Anlamı Nedir?</div>
      <div class="mc-q-word">${esc(word[0])}</div>
      ${word[2] ? `<div class="mc-q-example">${esc(word[2])}</div>` : ''}
    </div>
    <div class="mc-options" id="speed-opts">
      ${opts.map(o => `<button class="mc-opt" onclick="checkSpeedQ(this,'${escQ(o[0])}','${escQ(word[0])}','${escQ(word[1])}')">${esc(o[1])}</button>`).join('')}
    </div>
  </div>`;

  // render bittikten sonra timer'ı başlat (requestAnimationFrame ile tam senkron)
  requestAnimationFrame(() => {
    _spStart = Date.now();
    _startTimerTick();
    _spTimeout = setTimeout(() => {
      if (!_spAnswered) _timeoutSpeedQ();
    }, SPEED_TIME * 1000);
  });
}

function _freezeTimer() {
  _clearSpeedTimer();
  // Halka ve sayı zaten son tick'teki değerde kalır — ayrıca bir şey gerekmez
}

function checkSpeedQ(btn, chosen, correct, meaning) {
  if (_spAnswered) return;
  _spAnswered = true;
  _clearSpeedTimer();
  _freezeTimer();
  document.querySelectorAll('#speed-opts .mc-opt').forEach(b => b.classList.add('disabled'));

  const word = _spCards[_spIdx];
  const unit = word._unit || currentUnit;
  const hintEl = document.getElementById('speed-xp-hint');
  const timeLeft = _timeLeftNow();

  if (chosen === correct) {
    btn.classList.add('correct');
    _spScore++;
    markLearned(unit, correct);
    delete errorBox['u' + unit + '_' + correct]; saveErrors();

    const isBonus = timeLeft >= SPEED_BONUS_TIME;
    const xp = isBonus ? SPEED_XP_BONUS : SPEED_XP_NORMAL;
    if (hintEl) {
      hintEl.innerHTML = isBonus
        ? `🚀 <b>Hızlı Cevap! +${xp} Bonus XP</b>`
        : `✓ Doğru! <b>+${xp} XP</b>`;
      hintEl.className = 'speed-xp-hint sp-feedback-' + (isBonus ? 'bonus' : 'ok');
    }
    const prevLevel = _getLevelForXP(_xpData.xp);
    _xpData.xp += xp;
    const newLevel = _getLevelForXP(_xpData.xp);
    _saveXP(); _updateStreakWithFreeze(); _incrementGoal();
    if (newLevel > prevLevel) setTimeout(() => _showLevelUp(newLevel), 700);
    _renderHUD();
    _spawnConfetti();
    setTimeout(() => { _spIdx++; _renderSpeedQ(); }, 900);
  } else {
    btn.classList.add('wrong');
    document.querySelectorAll('#speed-opts .mc-opt').forEach(b => {
      if (b.textContent.trim() === meaning) b.classList.add('correct');
    });
    markUnlearned(unit, correct);
    errorBox['u' + unit + '_' + correct] = { word: correct, meaning, unit }; saveErrors();
    if (hintEl) {
      hintEl.innerHTML = `✗ Yanlış. <b>+0 XP</b>`;
      hintEl.className = 'speed-xp-hint sp-feedback-wrong';
    }
    _triggerWrong(btn);
    setTimeout(() => { _spIdx++; _renderSpeedQ(); }, 1400);
  }
}

function _timeoutSpeedQ() {
  if (_spAnswered) return;
  _spAnswered = true;
  _freezeTimer();
  const word = _spCards[_spIdx];
  const unit = word._unit || currentUnit;
  document.querySelectorAll('#speed-opts .mc-opt').forEach(b => {
    b.classList.add('disabled');
    if (b.textContent.trim() === word[1]) b.classList.add('correct');
  });
  markUnlearned(unit, word[0]);
  errorBox['u' + unit + '_' + word[0]] = { word: word[0], meaning: word[1], unit }; saveErrors();
  const hintEl = document.getElementById('speed-xp-hint');
  if (hintEl) {
    hintEl.innerHTML = `⏰ <b>Süre Doldu! Otomatik Yanlış.</b>`;
    hintEl.className = 'speed-xp-hint sp-feedback-wrong';
  }
  _triggerWrong();
  setTimeout(() => { _spIdx++; _renderSpeedQ(); }, 1600);
}

function _renderSpeedResult() {
  _clearSpeedTimer();
  const s = document.getElementById('screen-speed');
  const pct = Math.round((_spScore / _spTotal) * 100);
  s.innerHTML = `
  <div class="result-wrap">
    <div class="result-emoji">${pct >= 80 ? '🏎️' : pct >= 50 ? '⏱️' : '💡'}</div>
    <div class="result-title">${pct}% Başarı</div>
    <div class="result-sub">Hız Modu · ${_spTotal} sorudan ${_spScore} doğru</div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num" style="color:var(--success)">${_spScore}</div><div class="stat-lbl">Doğru</div></div>
      <div class="stat-box"><div class="stat-num" style="color:var(--error)">${_spTotal - _spScore}</div><div class="stat-lbl">Yanlış/Süre</div></div>
    </div>
    <button class="result-btn" style="background:#e74c3c;margin-bottom:8px" onclick="startSpeedMode()">🔄 Tekrar Oyna</button>
    <button class="result-btn outline" onclick="openUnit(${currentUnit})">Geri Dön</button>
  </div>`;
}

/* ── Speed Mode CSS ── */
const _speedStyles = `
.speed-timer-wrap {
  position: relative;
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  margin-left: auto; flex-shrink: 0;
}
.speed-timer-ring {
  position: absolute; inset: 0;
  width: 48px; height: 48px;
  overflow: visible;
}

.sp-track {
  fill: none;
  stroke: var(--border2);
  stroke-width: 3.5;
}

.sp-arc {
  fill: none;
  stroke: #2ecc71;
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-dasharray: 113.1;
  stroke-dashoffset: 0;
  transform-origin: 22px 22px;
  transform: rotate(-90deg);
  transition: stroke-dashoffset 0.05s linear, stroke 0.3s ease;
}

.speed-timer-num {
  position: relative; z-index: 1;
  font-size: 13px; font-weight: 900;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  transition: transform 0.1s ease;
}

@keyframes sp-urgent-pulse {
  0%,100% { transform: scale(1); }
  50%      { transform: scale(1.22); }
}

.speed-timer-num.sp-urgent {
  animation: sp-urgent-pulse 0.5s ease-in-out infinite;
  color: #e74c3c;
}

/* ── Feedback hint ── */
.speed-xp-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text3);
  font-weight: 600;
  padding: 6px 12px;
  background: var(--bg);
  border-radius: 10px;
  border: 1px solid var(--border);
  margin-bottom: 4px;
  transition: color 0.25s ease, border-color 0.25s ease, background 0.25s ease;
}
.sp-feedback-ok {
  color: var(--success) !important;
  border-color: rgba(46,204,113,0.35) !important;
}
.sp-feedback-bonus {
  color: #f39c12 !important;
  border-color: rgba(243,156,18,0.35) !important;
  background: rgba(243,156,18,0.06) !important;
}
.sp-feedback-wrong {
  color: var(--error) !important;
  border-color: rgba(231,76,60,0.3) !important;
}
`;
const _speedStyleEl = document.createElement('style');
_speedStyleEl.textContent = _speedStyles;
document.head.appendChild(_speedStyleEl);

window.startSpeedMode = startSpeedMode;
window.checkSpeedQ = checkSpeedQ;

// Run
initTheme(); 
renderHome();
_initDailyQuests();
_renderQuestsInHome();
updateErrorBadge();
_checkAchievements();

// Onboarding (first time only)
const onboardingDone = localStorage.getItem('ydt_onboarding_done');
if (!onboardingDone) {
    setTimeout(() => _showOnboarding(), 800);
}

/* ────────────────────────────────────────────────────────────────
   PRONUNCIATION (Text-to-Speech)
   ─────────────────────────────────────────────────────────────── */
function speakWord(word) {
    if (!('speechSynthesis' in window)) {
        showToast('Tarayıcı desteklemiyor');
        return;
    }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
}

window.speakWord = speakWord;

/* ────────────────────────────────────────────────────────────────
   ONSBOARDING FLOW
   ─────────────────────────────────────────────────────────────── */
const ONBOARDING_STEPS = [
    { icon: '📚', title: 'FDil\'e Hoş Geldin!', desc: 'YDT/DİL sınavı için kelime öğrenme uygulaması. Flash kartlar, testler ve spaced repetition ile etkili öğren.' },
    { icon: '🃏', title: 'Flash Kartlarla Öğren', desc: 'Kartı sağa kaydır = bildim, sola = bilmedim. Veya kartın üstüne tıkla veya çevir butonuna bas.' },
    { icon: '⚡', title: 'XP Kazan, Seviye Atla', desc: 'Doğru cevaplar XP kazandırır. Combo yaparsan XP\'nin katlanır! Günlük hedefini tamamla.' },
    { icon: '🏆', title: 'Başarıları Aç', desc: 'Rozaetleri kazan, görevleri tamamla ve YDT Şampiyonu ol! Öğrenmeye hazır mısın?' },
];

function _showOnboarding() {
    let step = 0;
    
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    
    function renderStep() {
        const data = ONBOARDING_STEPS[step];
        overlay.innerHTML = `
            <div class="onboarding-card">
                <div class="onboarding-icon">${data.icon}</div>
                <div class="onboarding-title">${data.title}</div>
                <div class="onboarding-desc">${data.desc}</div>
                <div class="onboarding-dots">
                    ${ONBOARDING_STEPS.map((_, i) => `<div class="onboarding-dot ${i === step ? 'active' : ''}"></div>`).join('')}
                </div>
                <button class="onboarding-btn" onclick="this.closest('.onboarding-overlay').remove(); localStorage.setItem('ydt_onboarding_done', 'true');">${step === ONBOARDING_STEPS.length - 1 ? 'Başla! 🚀' : 'Devam'}</button>
                ${step < ONBOARDING_STEPS.length - 1 ? `<button class="onboarding-skip" onclick="this.closest('.onboarding-overlay').remove(); localStorage.setItem('ydt_onboarding_done', 'true');">Atla</button>` : ''}
            </div>
        `;
    }
    
    renderStep();
    document.body.appendChild(overlay);
}

window._showOnboarding = _showOnboarding;

/* ────────────────────────────────────────────────────────────────
   DATA EXPORT/IMPORT
   ─────────────────────────────────────────────────────────────── */
function exportAllData() {
    const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        xp: _xpData,
        streak: _streakData,
        goal: _goalData,
        progress: progressRaw,
        errors: errorBox,
        customVocab: customVocab,
        achievements: _achievementData,
        quests: { completedCount: _questData.completedCount },
        sr: typeof srData !== 'undefined' ? srData : {},
        streakFreeze: _streakFreezeAvailable,
        streakFreezeUsed: _streakFreezeUsed,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fdil-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Veriler dışa aktarıldı!');
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.xp) { _xpData = data.xp; _saveXP(); }
            if (data.streak) { _streakData = data.streak; _saveStreak(); }
            if (data.goal) { _goalData = data.goal; _saveGoal(); }
            if (data.progress) { progressRaw = data.progress; saveProgress(); }
            if (data.errors) { errorBox = data.errors; saveErrors(); }
            if (data.customVocab) { customVocab = data.customVocab; saveVocab(); }
            if (data.achievements) { _achievementData = data.achievements; _saveAchievements(); }
            if (data.quests) { _questData.date = ''; _questData.completedCount = data.quests.completedCount || 0; _saveQuests(); }
            if (data.streakFreeze !== undefined) { _streakFreezeAvailable = data.streakFreeze; localStorage.setItem('ydt_streak_freeze', _streakFreezeAvailable); }
            if (data.streakFreezeUsed !== undefined) { _streakFreezeUsed = data.streakFreezeUsed; localStorage.setItem('ydt_streak_freeze_used', _streakFreezeUsed); }
            
            _renderHUD();
            renderHome();
            _checkAchievements();
            showToast('✓ Veriler içe aktarıldı!');
        } catch (err) {
            showToast('❌ Dosya geçersiz!');
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
}

window.exportAllData = exportAllData;
window.importData = importData;

/* ────────────────────────────────────────────────────────────────
   SETTINGS SCREEN
   ─────────────────────────────────────────────────────────────── */
function showSettings() {
    const overlay = document.createElement('div');
    overlay.className = 'word-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    
    overlay.innerHTML = `
        <div class="word-modal" style="max-height:85vh;overflow-y:auto;">
            <div class="word-modal-handle"></div>
            <div class="word-modal-header" style="padding:16px 24px 0;">
                <div class="word-modal-title" style="font-size:20px">⚙️ Ayarlar</div>
                <button onclick="this.closest('.word-modal-overlay').remove()" style="background:var(--bg);border:1px solid var(--border);border-radius:10px;width:32px;height:32px;font-size:16px;cursor:pointer">✕</button>
            </div>
            <div style="padding:16px 24px;">
                <div class="settings-section">
                    <div class="settings-section-title">📤 Veri Yönetimi</div>
                    <div class="export-import-area">
                        <button class="export-btn" onclick="exportAllData()">
                            📤 Verileri Dışa Aktar
                        </button>
                        <label class="import-btn">
                            📥 Verileri İçe Aktar
                            <input type="file" accept=".json" onchange="importData(this.files[0])" style="display:none">
                        </label>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">❄️ Streak Freeze</div>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Mevcut Freeze Hakları</div>
                            <div class="settings-item-desc">Her 30 günlük streak için 1 freeze kazan</div>
                        </div>
                        <span class="streak-freeze-badge">❄️ ${_streakFreezeAvailable}</span>
                    </div>
                    ${_streakFreezeAvailable > 0 ? `
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Freeze Kullan</div>
                            <div class="settings-item-desc">Yarın çalışmasanda streak korunsun</div>
                        </div>
                        <button class="settings-btn" onclick="if(_useStreakFreeze()){showToast('❄️ Freeze aktif!');this.textContent='Aktif!';this.disabled=true;}">Aktive Et</button>
                    </div>
                    ` : ''}
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">🗑️ Verileri Sil</div>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">Tüm İlerlemeyi Sıfırla</div>
                            <div class="settings-item-desc">XP, streak, achievement ve tüm ilerleme silinir</div>
                        </div>
                        <button class="settings-btn danger" onclick="if(confirm('Emin misin? Bu işlem geri alınamaz!')){localStorage.clear();location.reload();}">Sıfırla</button>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">📱 Uygulama</div>
                    <div class="settings-item">
                        <div class="settings-item-info">
                            <div class="settings-item-title">PWA Kurulumu</div>
                            <div class="settings-item-desc" id="pwa-install-status">Ana ekrana ekle ve offline çalıştır</div>
                        </div>
                        <button class="settings-btn" id="pwa-install-btn" onclick="installPWA()" style="display:none">📲 Kur</button>
                    </div>
                    <div id="pwa-install-help" style="display:none;background:var(--bg);border-radius:12px;padding:16px;margin-top:8px">
                        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📱 PWA Nasıl Kurulur?</div>
                        <div style="font-size:12px;color:var(--text2);line-height:1.8">
                            <div style="margin-bottom:8px"><b>Chrome/Edge:</b> Sağ üst menü → "Ana ekrana ekle" veya adres çubuğundaki + ikonu</div>
                            <div style="margin-bottom:8px"><b>Safari (iOS):</b> Paylaş butonu → "Ana Ekrana Ekle"</div>
                            <div style="margin-bottom:8px"><b>Firefox:</b> Sağ üst menü → "Uygulama kur" veya + ikonu</div>
                        </div>
                    </div>
                </div>
                
                <div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">
                    FDil v1.0 · YDT Kelime Öğrenme<br>
                    ❤️ by yusufbrny
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

window.showSettings = showSettings;

// PWA Install Handler
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    pwaInstallable = true;
    updatePWAInstallUI();
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    pwaInstallable = false;
    updatePWAInstallUI();
    showToast('🎉 PWA kuruldu! Ana ekrandan açabilirsin');
});

function updatePWAInstallUI() {
    setTimeout(() => {
        const btn = document.getElementById('pwa-install-btn');
        const status = document.getElementById('pwa-install-status');
        const help = document.getElementById('pwa-install-help');
        if (btn) {
            if (pwaInstallable && deferredPrompt) {
                btn.style.display = '';
                btn.textContent = '📲 Kur';
                if (status) status.textContent = 'Kurulum hazır!';
            } else if (window.matchMedia('(display-mode: standalone)').matches) {
                btn.style.display = 'none';
                if (status) status.textContent = '✓ PWA olarak açık';
            } else {
                btn.style.display = 'none';
                if (status) status.textContent = 'Tarayıcıda açık';
            }
        }
        if (help) {
            help.style.display = 'block';
        }
    }, 100);
}

async function installPWA() {
    if (!deferredPrompt) {
        showToast('PWA kurulumu tarayıcı tarafından desteklenmiyor');
        return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        showToast('🎉 Kurulum başladı!');
    }
    deferredPrompt = null;
    pwaInstallable = false;
    updatePWAInstallUI();
}

/* ────────────────────────────────────────────────────────────────
   STATS PANEL - Add Achievements
   ─────────────────────────────────────────────────────────────── */
const _origRenderStatsContent = window.renderStatsContent;
window.renderStatsContent = function() {
    if (_origRenderStatsContent) _origRenderStatsContent();
    const panel = document.getElementById('stats-panel');
    if (panel) {
        _renderAchievementsInStats(panel.querySelector('.stats-panel') || panel);
    }
};

/* ═══════════════════════════════════════════════════════════════
   GENERAL ENGLISH - Free Dictionary API Integration
   ═══════════════════════════════════════════════════════════════ */

const GENERAL_WORDS = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absolute', 'absorb', 
    'abstract', 'absurd', 'abundant', 'academic', 'accept', 'access', 'accident', 
    'accompany', 'accomplish', 'according', 'account', 'accurate', 'achieve', 'acid', 
    'acquire', 'across', 'action', 'active', 'activity', 'actor', 'actual', 'adapt', 
    'add', 'addition', 'adequate', 'adjust', 'admire', 'admit', 'adolescent', 'adopt', 
    'adult', 'advance', 'advantage', 'adventure', 'adverse', 'advertise', 'advice', 
    'advise', 'affair', 'affect', 'afford', 'afraid', 'after', 'afternoon', 
    'again', 'against', 'age', 'agency', 'agenda', 'agent', 'aggressive', 'agree', 
    'agreement', 'ahead', 'aim', 'air', 'aircraft', 'airline', 'airport', 'alarm', 
    'album', 'alcohol', 'alert', 'alien', 'alike', 'alive', 'allow', 'almost', 
    'alone', 'along', 'already', 'also', 'alter', 'alternative', 'although', 
    'always', 'amaze', 'ambition', 'ambitious', 'amend', 'america', 'american', 
    'among', 'amount', 'ample', 'amuse', 'analyze', 'ancestor', 'ancient', 
    'anger', 'angle', 'angry', 'animal', 'announce', 'annual', 'another', 'answer', 
    'anticipate', 'anxiety', 'anxious', 'any', 'anybody', 'anyhow', 'anyone', 
    'anything', 'anyway', 'anywhere', 'apart', 'apology', 'apparent', 'appeal', 
    'appear', 'appearance', 'appetite', 'apple', 'apply', 'appoint', 'appointment', 
    'appreciate', 'approach', 'appropriate', 'approve', 'approximate', 'april', 
    'architect', 'architecture', 'area', 'argue', 'argument', 'arise', 'arm', 
    'army', 'around', 'arrange', 'arrangement', 'arrest', 'arrival', 'arrive', 
    'arrow', 'article', 'artificial', 'artist', 'artistic', 'aside', 'ask', 
    'asleep', 'aspect', 'assert', 'assess', 'asset', 'assign', 'assist', 
    'assistance', 'assistant', 'associate', 'association', 'assume', 'assure', 
    'astonish', 'athlete', 'atmosphere', 'attach', 'attack', 'attain', 'attempt', 
    'attend', 'attention', 'attitude', 'attorney', 'attract', 'attraction', 
    'attractive', 'audience', 'august', 'aunt', 'author', 'authority', 'automatic', 
    'autumn', 'available', 'average', 'avoid', 'await', 'wake', 'walk', 'wall', 
    'wander', 'want', 'warm', 'warmth', 'warn', 'warning', 'wash', 'waste', 'watch', 
    'water', 'wave', 'way', 'we', 'weak', 'wealth', 'weapon', 'wear', 'weather', 
    'wedding', 'wednesday', 'week', 'weekend', 'weekly', 'weigh', 'weight', 'welcome', 
    'welfare', 'well', 'west', 'western', 'whatever', 'wheat', 'wheel', 'when', 
    'whenever', 'where', 'whereas', 'wherever', 'whether', 'which', 'while', 
    'whip', 'whisper', 'white', 'who', 'whoever', 'whole', 'whom', 'whose', 'why', 
    'wide', 'widely', 'widespread', 'wife', 'wild', 'will', 'willing', 'win', 
    'wind', 'window', 'wine', 'wing', 'winner', 'winter', 'wipe', 'wire', 
    'wisdom', 'wise', 'wish', 'with', 'withdraw', 'within', 'without', 'witness', 
    'woman', 'wonder', 'wonderful', 'wood', 'wooden', 'wool', 'word', 'work', 
    'worker', 'workplace', 'workshop', 'world', 'worldwide', 'worry', 'worse', 
    'worship', 'worst', 'worth', 'worthwhile', 'worthy', 'would', 'wound', 
    'wrap', 'write', 'writer', 'writing', 'wrong', 'yard', 'yeah', 'year', 
    'yellow', 'yes', 'yesterday', 'yet', 'yield', 'you', 'young', 'your', 
    'yours', 'yourself', 'youth', 'zero', 'zone'
];

// generalCache already declared at top

function _saveGeneralCache() {
    localStorage.setItem('ydt_general_cache', JSON.stringify(generalCache));
}

async function fetchWordData(word) {
    const w = word.toLowerCase().trim();
    if (generalCache[w]) return generalCache[w];
    
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${w}`);
        if (!response.ok) throw new Error('Not found');
        
        const data = await response.json();
        const entry = data[0];
        
        const result = {
            word: w,
            phonetic: entry.phonetic || entry.phonetics?.[0]?.text || '',
            audio: entry.phonetics?.find(p => p.audio)?.audio || '',
            definitions: [],
            examples: [],
            synonyms: [],
            partOfSpeech: ''
        };
        
        if (entry.meanings && entry.meanings.length > 0) {
            const meaning = entry.meanings[0];
            result.partOfSpeech = meaning.partOfSpeech || '';
            
            if (meaning.definitions) {
                for (const def of meaning.definitions.slice(0, 3)) {
                    result.definitions.push(def.definition);
                    if (def.example) result.examples.push(def.example);
                }
            }
            
            if (meaning.synonyms) {
                result.synonyms = [...new Set(meaning.synonyms.slice(0, 5))];
            }
        }
        
        generalCache[w] = result;
        _saveGeneralCache();
        return result;
        
    } catch (error) {
        console.log('Failed to fetch:', w, error);
        return null;
    }
}

// ===== READING =====
const READING_PASSAGES = [
    {
        id: 1,
        title: "The Coffee Shop",
        level: "Beginner",
        text: "Every morning, Sarah walks to the small coffee shop on Main Street. She orders her usual coffee with milk and a croissant. The owner, Mr. Chen, always remembers her order. Sarah likes to sit by the window and watch people passing by. She reads the news on her phone while enjoying her coffee. The shop has a warm and friendly atmosphere. Many regular customers come here to start their day. Sarah has been a customer for three years now.",
        turkish: "Her sabah Sarah, Main Street'deki küçük kahve dükkanına yürüyerek gider. Her zamanki gibi sütlü kahve ve bir croissant order. Sahibi Bay Chen her zaman siparişini hatırlar. Sarah pencere kenarında oturmayı ve geçen insanları izlemeyi sever. Kahvesini yudumlarken telefonundan haberleri okur. Dükkanın sıcak ve dostça bir atmosferi vardır. Birçok düzenli müşteri buraya günlerine başlamak için gelir. Sarah artık üç yıldır müşteridir.",
        keywords: ["croissant", "atmosphere", "regular", "customer", "window", "order"]
    },
    {
        id: 2,
        title: "A Day in the Park",
        level: "Beginner",
        text: "Last Sunday, Tom went to the central park with his family. The weather was perfect - sunny with a gentle breeze. They brought a picnic basket full of sandwiches and fruits. Tom's children played on the swings and the slide while their parents sat on the grass. In the afternoon, they rented a boat and rowed around the lake. It was a peaceful and enjoyable day. They promised to come back again soon.",
        turkish: "Geçen pazar Tom ailesiyle merkezi parka gitti. Hava mükemmeldi - güneşli ve hafif bir esinti vardı. Sandviç ve meyvelerle dolu bir piknik sepeti getirdiler. Tom'un çocukları salıncaklarda ve kaydırakta oynarken, ebeveynleri çimlerin üstünde oturdu. Öğleden sonra bir tekne kiralayıp gölün etrafında kürek çektiler. Barışçıl ve keyifli bir gündü. Yakında tekrar gelmeye söz verdiler.",
        keywords: ["picnic", "breeze", "swings", "slide", "grass", "row", "peaceful"]
    },
    {
        id: 3,
        title: "The New Student",
        level: "Intermediate",
        text: "When Maria transferred to her new school, she felt nervous and anxious. On her first day, she couldn't find her classroom and arrived late. The teacher asked her to introduce herself in front of the class. She stood up, trembling slightly, and said her name and where she came from. Some students smiled kindly, but others seemed unimpressed. During lunch break, a girl named Emma approached her and offered to show her around. Maria felt relieved and grateful for the friendly welcome.",
        turkish: "Maria yeni okuluna geçtiğinde, gergin ve endişeli hissetti. İlk gününde sınıfını bulamadı ve geç kaldı. Öğretmen ondan sınıfın önünde kendini tanıtmasını istedi. Hafifçe titreyerek ayağa kalktı ve adını, nereden geldiğini söyledi. Bazı öğrenciler nazikçe gülümsedi, ama diğerleri etkilenmemiş görünüyordu. Teneffüs sırasında Emma adında bir kız ona yaklaştı ve etrafını gezdirmeyi teklif etti. Maria rahatlamış ve nazik karşılaması için minnettar hissetti.",
        keywords: ["transfer", "nervous", "anxious", "trembling", "relieved", "grateful", "approach"]
    },
    {
        id: 4,
        title: "The Job Interview",
        level: "Intermediate",
        text: "David had been preparing for this job interview for weeks. He researched the company, practiced common questions, and chose his best outfit. When he arrived, the lobby was modern and impressive. The receptionist gave him a form to fill out. After waiting for ten minutes, a woman in a professional suit escorted him to the conference room. The interview lasted about forty-five minutes. They discussed his experience, skills, and career goals. David felt confident about his performance and hoped to receive an offer soon.",
        turkish: "David haftalardır bu iş görüşmesi için hazırlanıyordu. Şirketi araştırdı, yaygın soruları pratik yaptı ve en iyi kıyafetini seçti. Geldiğinde lobisi modern ve etkileyiciydi. Resepsiyon görevlisi doldurması için ona bir form verdi. On dakika bekledikten sonra, profesyonel bir takım elbise giyen bir kadın onu konferans odasına götürdü. Görüşme yaklaşık kırk beş dakika sürdü. Deneyimini, becerilerini ve kariyer hedeflerini tartıştılar. David performansından emin hissetti ve yakında bir teklif almayı umuyordu.",
        keywords: ["interview", "lobby", "receptionist", "escort", "conference", "outfit", "confident"]
    },
    {
        id: 5,
        title: "Learning to Cook",
        level: "Beginner",
        text: "Last month, James decided to learn how to cook. He bought a recipe book and went to the grocery store to buy ingredients. His first attempt was a simple pasta dish. He followed the instructions carefully, but the sauce was too salty. He didn't give up. The second time, he used less salt and added some herbs. It tasted much better. Now he cooks for himself every day and even invited his friends for dinner last weekend. They praised his improvement and asked for the recipe.",
        turkish: "Geçen ay James yemek yapmayı öğrenmeye karar verdi. Bir yemek tarifi kitabı satın aldı ve malzemeler satın almak için markete gitti. İlk denemesi basit bir makarna yemeğiydi. Talimatları dikkatlice takip etti, ama sos çok tuzluydu. Vazgeçmedi. İkinci seferde daha az tuz kullandı ve biraz ot ekledi. Çok daha iyi tattı. Şimdi her gün kendine yemek pişiriyor ve geçen hafta sonu arkadaşlarını akşam yemeğine davet etti. Onlar James'in gelişimini övdüler ve tarif istediler.",
        keywords: ["recipe", "ingredient", "sauce", "herbs", "improvement", "praise", "attempt"]
    },
    {
        id: 6,
        title: "The Weekend Plans",
        level: "Beginner",
        text: "Sophie was looking forward to the weekend. She made several plans with her friends. On Saturday morning, they were going to the farmers market to buy fresh vegetables and fruits. In the afternoon, they planned to watch a movie at the cinema. Sunday was reserved for a hiking trip in the mountains. Sophie's friend Lisa offered to drive them in her car. They expected the weather to be clear and perfect for outdoor activities. Sophie was excited about spending time with her friends.",
        turkish: "Sophie hafta sonunu dört gözle bekliyordu. Arkadaşlarıyla birkaç plan yaptı. Cumartesi sabahı, taze sebze ve meyve satın almak için çiftçi pazarına gideceklermiş. Öğleden sonra sinemada film izlemeyi planladılar. Pazar günü dağlarda yürüyüş için ayrıldı. Sophie'nin arkadaşı Lisa arabasıyla onları götürmeyi teklif etti. Hava durumunun açık ve açık hava etkinlikleri için mükemmel olmasını beklediler. Sophie arkadaşlarıyla vakit geçirmek için heyecanlıydı.",
        keywords: ["farmers market", "vegetables", "hiking", "mountains", "outdoor", "excited", "reserved"]
    },
    {
        id: 7,
        title: "Moving to a New City",
        level: "Advanced",
        text: "Relocating to an unfamiliar city presented numerous challenges for the young professional. She had to find an affordable apartment, establish a reliable transportation system, and build a social network from scratch. The process of searching for housing online proved to be tedious and time-consuming. She scheduled multiple viewings and eventually signed a lease for a modest studio apartment near her workplace. Adjusting to the faster pace of city life required considerable patience and perseverance. Nevertheless, she gradually adapted to her new environment and began to feel a sense of belonging.",
        turkish: "Genç profesyonel için tanımadığı bir şehre taşınmak çok sayıda zorluk ortaya koydu. Uygun fiyatlı bir daire bulması, güvenilir bir ulaşım sistemi kurması ve sıfırdan bir sosyal ağ oluşturması gerekiyordu. Konut arama süreci yorucu ve zaman alıcıydı. Birçok gösterim planladı ve sonunda iş yerine yakın mütevazi bir stüdyo daire için lease imzaladı. Şehir hayatının daha hızlı temposuna alışmak, oldukça sabır ve azim gerektirdi. Yine de kademeli olarak yeni çevresine uyum sağladı ve bir aidiyet duygusu hissetmeye başladı.",
        keywords: ["relocating", "numerous", "affordable", "scratch", "tedious", "lease", "perseverance", "belonging"]
    },
    {
        id: 8,
        title: "The Book Club",
        level: "Intermediate",
        text: "Every Thursday evening, a group of literature enthusiasts gathers at the local library to discuss their latest read. The club has been operating for over five years and currently has fifteen members. This month they are analyzing a classic novel by a well-known author. Each member comes prepared with notes and questions to share. The discussions are always lively and thought-provoking. Some members agree on certain interpretations while others offer alternative perspectives. The club promotes a respectful environment where everyone's opinion is valued.",
        turkish: "Her perşembe akşamı, bir grup edebiyat meraklısı en son okudukları kitabı tartışmak için yerel kütüphanede buluşur. Kulüp beş yıldan fazla süredir faaliyet gösteriyor ve şu anda on beş üyesi var. Bu ay ünlü bir yazarın klasik bir romanını analiz ediyorlar. Her üye paylaşmak için notlar ve sorularla hazırlanır. Tartışmalar her zaman canlı ve düşündürücüdür. Bazı üyeler belirli yorumlar konusunda hemfikirken, diğerleri alternatif perspektifler sunuyor. Kulüp, herkesin fikrinin değerli görüldüğü saygılı bir ortamı teşvik ediyor.",
        keywords: ["literature", "enthusiast", "analyzing", "interpretations", "alternative", "perspective", "promotes"]
    },
    {
        id: 9,
        title: "Health and Lifestyle",
        level: "Intermediate",
        text: "Modern sedentary lifestyles have contributed to a significant increase in health problems worldwide. Medical experts recommend engaging in regular physical exercise and maintaining a balanced diet. Studies show that people who walk for at least thirty minutes daily experience reduced stress levels and improved sleep quality. Additionally, limiting screen time and taking regular breaks from work can prevent eye strain and back pain. Following these simple guidelines can lead to a healthier and more productive life.",
        turkish: "Modern hareketsiz yaşam tarzları dünya genelinde sağlık sorunlarının önemli ölçüde artmasına katkıda bulunmuştur. Tıp uzmanları düzenli fiziksel egzersiz yapmayı ve dengeli beslenmeyi öneriyor. Çalışmalar, günde en az otuz dakika yürüyen kişilerin stres seviyelerinde azalma ve uyku kalitesinde iyileşme yaşadığını gösteriyor. Ayrıca, ekran süresini sınırlamak ve işten düzenli molalar vermek göz yorgunluğunu ve sırt ağrısını önleyebilir. Bu basit yönergeleri takip etmek daha sağlıklı ve üretken bir yaşama yol açabilir.",
        keywords: ["sedentary", "contribute", "balanced diet", "stress", "productive", "guidelines", "prevent"]
    },
    {
        id: 10,
        title: "Technology and Communication",
        level: "Advanced",
        text: "The advent of smartphones has revolutionized the way people communicate and access information. While these devices have undoubtedly enhanced convenience and connectivity, they have also raised concerns about privacy and digital addiction. Many individuals spend excessive hours on social media platforms, often at the expense of real-world interactions. Furthermore, the constant bombardment of notifications can lead to decreased concentration and mental fatigue. Experts suggest implementing digital wellness strategies to maintain a healthy relationship with technology.",
        turkish: "Akıllı telefonların ortaya çıkışı, insanların iletişim kurma ve bilgiye erişme biçimini devrimleştirdi. Bu cihazlar kuşkusuz kolaylık ve bağlantıyı artırmış olsa da, gizlilik ve dijital bağımlılık konusunda endişeleri de artırmıştır. Birçok kişi gerçek dünya etkileşimleri pahasına sosyal medya platformlarında aşırı saatler geçiriyor. Üstelik sürekli bildiri bombardımanı konsantrasyonun azalmasına ve zihinsel yorgunluğa yol açabilir. Uzmanlar teknolojiyle sağlıklı bir ilişki sürdürmek için dijital sağlık stratejileri uygulamayı öneriyor.",
        keywords: ["advent", "revolutionized", "undoubtedly", "connectivity", "bombardment", "fatigue", "wellness"]
    }
];

let readingLearnedWords = JSON.parse(localStorage.getItem('ydt_reading_words') || '{}');

function _saveReadingWords() {
    localStorage.setItem('ydt_reading_words', JSON.stringify(readingLearnedWords));
}

function showReading() {
    showScreen('screen-reading');
    renderReadingHome();
}

function renderReadingHome() {
    const s = document.getElementById('screen-reading');
    const completed = Object.keys(readingLearnedWords).filter(k => readingLearnedWords[k]).length;
    
    s.innerHTML = `
        <div class="unit-header">
            <button class="back-btn" onclick="goHome()">←</button>
            <div>
                <div class="unit-title-h">📖 Günlük Reading</div>
                <div class="unit-sub">${completed}/${READING_PASSAGES.length} metin tamamlandı</div>
            </div>
        </div>
        <div class="general-wrap" style="padding:16px;overflow-y:auto">
            <div style="margin-bottom:20px">
                <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">Seviye: Başlangıç</div>
                <div style="display:grid;gap:10px">
                    ${READING_PASSAGES.filter(p => p.level === 'Beginner').map(p => `
                        <div class="home-card" onclick="openReading(${p.id})" style="border-color:rgba(46,204,113,0.4)">
                            <div>
                                <div class="home-card-title" style="color:var(--text)">${p.title}</div>
                                <div class="home-card-sub">${p.text.split(' ').length} kelime · ${p.level}</div>
                            </div>
                            ${readingLearnedWords[p.id] ? '<span style="color:var(--success);font-size:20px">✓</span>' : '<span style="color:#2ecc71;font-size:20px;font-weight:700">→</span>'}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div style="margin-bottom:20px">
                <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">Seviye: Orta</div>
                <div style="display:grid;gap:10px">
                    ${READING_PASSAGES.filter(p => p.level === 'Intermediate').map(p => `
                        <div class="home-card" onclick="openReading(${p.id})" style="border-color:rgba(241,196,15,0.4)">
                            <div>
                                <div class="home-card-title" style="color:var(--text)">${p.title}</div>
                                <div class="home-card-sub">${p.text.split(' ').length} kelime · ${p.level}</div>
                            </div>
                            ${readingLearnedWords[p.id] ? '<span style="color:var(--success);font-size:20px">✓</span>' : '<span style="color:#f1c40f;font-size:20px;font-weight:700">→</span>'}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div>
                <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">Seviye: İleri</div>
                <div style="display:grid;gap:10px">
                    ${READING_PASSAGES.filter(p => p.level === 'Advanced').map(p => `
                        <div class="home-card" onclick="openReading(${p.id})" style="border-color:rgba(231,76,60,0.4)">
                            <div>
                                <div class="home-card-title" style="color:var(--text)">${p.title}</div>
                                <div class="home-card-sub">${p.text.split(' ').length} kelime · ${p.level}</div>
                            </div>
                            ${readingLearnedWords[p.id] ? '<span style="color:var(--success);font-size:20px">✓</span>' : '<span style="color:#e74c3c;font-size:20px;font-weight:700">→</span>'}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

let readingFlashCards = [];
let readingFlashIdx = 0;
let readingFlashKnown = [];
let readingFlashUnknown = [];

function openReading(id) {
    const passage = READING_PASSAGES.find(p => p.id === id);
    if (!passage) return;
    const s = document.getElementById('screen-reading');
    const isDone = readingLearnedWords[id];
    
    s.innerHTML = `
        <div class="unit-header">
            <button class="back-btn" onclick="renderReadingHome()">←</button>
            <div>
                <div class="unit-title-h">${passage.title}</div>
                <div class="unit-sub">${passage.level} · ${passage.text.split(' ').length} kelime</div>
            </div>
            <button onclick="toggleReadingWord(this,'${passage.id}')" style="margin-left:auto;padding:6px 14px;background:${isDone ? 'var(--success)' : 'var(--card)'};color:${isDone ? 'white' : 'var(--text)'};border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">
                ${isDone ? '✓ Tamamlandı' : '✓ Tamamla'}
            </button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px">
            <div style="background:var(--card);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid var(--border)">
                <div style="font-size:15px;line-height:1.8;color:var(--text)">${passage.text}</div>
            </div>
            <div style="background:rgba(46,204,113,0.1);border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid rgba(46,204,113,0.3)">
                <div style="font-size:12px;font-weight:700;color:var(--success);margin-bottom:6px">TÜRKÇE ÇEVIRI</div>
                <div style="font-size:14px;line-height:1.8;color:var(--text)">${passage.turkish}</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
                ${passage.keywords.map(w => `<div onclick="dictSearchWord('${w}')" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px;cursor:pointer;text-align:center;font-size:14px;font-weight:600;color:var(--accent)">${w}</div>`).join('')}
            </div>
            <button onclick="startReadingFlash(${id})" style="width:100%;padding:14px;background:rgba(155,89,182,0.15);color:#9b59b6;border:1.5px solid rgba(155,89,182,0.3);border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">
                🃏 Kelimeleri Flash Kartla Çalış
            </button>
            <div style="margin-top:16px;font-size:12px;color:var(--text3);text-align:center">Kelimelere tıklayarak sözlükte ara</div>
        </div>
    `;
}

async function startReadingFlash(id) {
    const passage = READING_PASSAGES.find(p => p.id === id);
    if (!passage || passage.keywords.length === 0) { showToast('Bu metinde kelime yok!'); return; }
    
    showScreen('screen-reading');
    readingFlashCards = [];
    readingFlashIdx = 0;
    readingFlashKnown = [];
    readingFlashUnknown = [];
    
    for (const kw of passage.keywords) {
        const data = await fetchDictData(kw);
        readingFlashCards.push({
            word: kw,
            turkish: data?.turkish || '',
            definition: data?.meanings?.[0]?.definitions?.[0] || '',
            example: data?.meanings?.[0]?.example || ''
        });
    }
    
    readingFlashCards = shuffle(readingFlashCards);
    renderReadingFlash(id);
}

function renderReadingFlash(id) {
    const s = document.getElementById('screen-reading');
    if (readingFlashIdx >= readingFlashCards.length) {
        const known = readingFlashKnown.length;
        const total = readingFlashCards.length;
        s.innerHTML = `
            <div class="result-wrap">
                <div class="result-emoji">${known === total ? '🏆' : known > total / 2 ? '💪' : '📚'}</div>
                <div class="result-title">${known === total ? 'Mükemmel!' : 'Sonuçlar'}</div>
                <div class="result-sub">${total} kelimeden ${known} tanesini bildiniz</div>
                <div class="stat-row">
                    <div class="stat-box"><div class="stat-num" style="color:var(--success)">${known}</div><div class="stat-lbl">Bildim ✓</div></div>
                    <div class="stat-box"><div class="stat-num" style="color:var(--error)">${readingFlashUnknown.length}</div><div class="stat-lbl">Bilmedim ✗</div></div>
                </div>
                ${readingFlashUnknown.length > 0 ? `<button class="result-btn" onclick="readingFlashCards=shuffle([...readingFlashUnknown]);readingFlashIdx=0;readingFlashKnown=[];readingFlashUnknown=[];renderReadingFlash(${id})">Bilemediklerimi Tekrar Et</button>` : ''}
                <button class="result-btn outline" onclick="openReading(${id})">← Geri Dön</button>
            </div>`;
        return;
    }
    
    const card = readingFlashCards[readingFlashIdx];
    const pct = Math.round((readingFlashIdx / readingFlashCards.length) * 100);
    
    s.innerHTML = `
        <div class="unit-header">
            <button class="back-btn" onclick="openReading(${id})">←</button>
            <div>
                <div class="unit-title-h">🃏 Reading Flash</div>
                <div class="unit-sub">${readingFlashIdx + 1}/${readingFlashCards.length}</div>
            </div>
        </div>
        <div class="flash-wrap">
            <div class="flash-progress-row">
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <span class="flash-counter-badge">${readingFlashIdx + 1}/${readingFlashCards.length}</span>
            </div>
            <div class="flash-card-wrap">
                <div class="flash-card" id="reading-fc" onclick="flipReadingCard()">
                    <div class="flash-face flash-front">
                        <div class="flash-hint">İngilizce</div>
                        <div class="flash-word">${esc(card.word)}</div>
                        <div class="flash-hint-bottom">ortaya dokun — kartı çevir</div>
                    </div>
                    <div class="flash-face flash-back">
                        <div class="flash-hint" style="color:rgba(255,255,255,0.7)">Türkçe</div>
                        <div class="flash-meaning">${esc(card.turkish) || 'Çeviri bulunamadı'}</div>
                        ${card.definition ? `<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:8px;padding:8px;background:rgba(0,0,0,0.15);border-radius:8px">${esc(card.definition)}</div>` : ''}
                    </div>
                </div>
            </div>
            <button class="flash-flip-btn" onclick="event.stopPropagation();flipReadingCard()">🔄 Kartı Çevir</button>
            <div class="swipe-btn-row">
                <button class="swipe-btn wrong" onclick="readingFlashAnswer(false, ${id})">✗ Bilmedim</button>
                <button class="swipe-btn right" onclick="readingFlashAnswer(true, ${id})">✓ Bildim</button>
            </div>
        </div>`;
}

function flipReadingCard() {
    const fc = document.getElementById('reading-fc');
    if (fc) fc.classList.toggle('flipped');
}

function readingFlashAnswer(known, id) {
    const card = readingFlashCards[readingFlashIdx];
    if (known) {
        readingFlashKnown.push(card);
    } else {
        readingFlashUnknown.push(card);
    }
    readingFlashIdx++;
    setTimeout(() => renderReadingFlash(id), 300);
}

function toggleReadingWord(btn, id) {
    readingLearnedWords[id] = !readingLearnedWords[id];
    _saveReadingWords();
    if (readingLearnedWords[id]) {
        btn.style.background = 'var(--success)';
        btn.style.color = 'white';
        btn.textContent = '✓ Tamamlandı';
        showToast('Metin tamamlandı! ✓');
    } else {
        btn.style.background = 'var(--card)';
        btn.style.color = 'var(--text)';
        btn.textContent = '✓ Tamamla';
    }
}

window.showReading = showReading;
window.openReading = openReading;
window.toggleReadingWord = toggleReadingWord;
window.startReadingFlash = startReadingFlash;
window.renderReadingFlash = renderReadingFlash;

// ===== DICTIONARY =====
let dictCache = JSON.parse(localStorage.getItem('ydt_dict_cache') || '{}');
let dictHistory = JSON.parse(localStorage.getItem('ydt_dict_history') || '[]');

function _saveDictCache() {
    localStorage.setItem('ydt_dict_cache', JSON.stringify(dictCache));
}
function _saveDictHistory() {
    localStorage.setItem('ydt_dict_history', JSON.stringify(dictHistory));
}

async function fetchTurkishMeaning(word) {
    const cacheKey = `ydt_tr_${word.toLowerCase().trim()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;
    
    try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|tr`);
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            const result = data.responseData.translatedText.trim();
            localStorage.setItem(cacheKey, result);
            return result;
        }
    } catch (e) {}
    
    try {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(word)}`);
        const data = await response.json();
        if (data && data[0] && data[0][0]) {
            const result = data[0][0][0].trim();
            localStorage.setItem(cacheKey, result);
            return result;
        }
    } catch (e) {}
    
    return '';
}

async function fetchDictData(word) {
    const w = word.toLowerCase().trim();
    if (dictCache[w] && dictCache[w].turkish) return dictCache[w];
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${w}`);
        if (!response.ok) return null;
        const data = await response.json();
        const entry = data[0];
        const turkish = await fetchTurkishMeaning(w);
        const result = {
            word: w,
            phonetic: entry.phonetic || entry.phonetics?.[0]?.text || '',
            audio: entry.phonetics?.find(p => p.audio)?.audio || '',
            turkish: turkish,
            meanings: []
        };
        for (const meaning of entry.meanings || []) {
            const syns = meaning.synonyms?.slice(0, 8) || [];
            const ants = meaning.antonyms?.slice(0, 8) || [];
            const defs = (meaning.definitions || []).slice(0, 3).map(d => d.definition);
            result.meanings.push({
                partOfSpeech: meaning.partOfSpeech || '',
                definitions: defs,
                synonyms: syns,
                antonyms: ants,
                example: meaning.definitions?.[0]?.example || ''
            });
        }
        dictCache[w] = result;
        _saveDictCache();
        if (!dictHistory.includes(w)) {
            dictHistory.unshift(w);
            if (dictHistory.length > 50) dictHistory.pop();
            _saveDictHistory();
        }
        return result;
    } catch (e) {
        return null;
    }
}

function showDictionary() {
    showScreen('screen-dict');
    renderDict();
}

function renderDict() {
    const s = document.getElementById('screen-dict');
    s.innerHTML = `
        <div class="unit-header">
            <button class="back-btn" onclick="goHome()">←</button>
            <div>
                <div class="unit-title-h">📖 İngilizce Sözlük</div>
                <div class="unit-sub">Eş ve zıt anlamlılar</div>
            </div>
        </div>
        <div style="padding:12px 16px">
            <div style="display:flex;gap:8px">
                <input id="dict-input" style="flex:1;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:15px" placeholder="Kelime yazın..." onkeydown="if(event.key==='Enter')dictSearch()">
                <button onclick="dictSearch()" style="padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer">Ara</button>
            </div>
        </div>
        <div id="dict-content" style="flex:1;overflow-y:auto;padding:0 16px 16px">
            ${dictHistory.length > 0 ? `<div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:8px">Son Aramalar</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${dictHistory.slice(0, 20).map(w => `<span onclick="dictSearchWord('${w}')" style="background:var(--card);border:1px solid var(--border);padding:4px 10px;border-radius:20px;font-size:13px;cursor:pointer">${w}</span>`).join('')}</div>` : ''}
            <div id="dict-result"></div>
        </div>
    `;
    const input = document.getElementById('dict-input');
    if (input) input.focus();
}

function dictSearch() {
    const val = document.getElementById('dict-input').value.trim();
    if (!val) return;
    dictSearchWord(val);
}

async function dictSearchWord(word) {
    const resultEl = document.getElementById('dict-result');
    resultEl.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div><div style="margin-top:10px;color:var(--text3)">Aranıyor...</div></div>`;
    const data = await fetchDictData(word);
    if (!data) {
        resultEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--error)">❌ "${word}" bulunamadı</div>`;
        return;
    }
    
    let html = `<div style="margin-top:16px">
        <div style="background:var(--card);border-radius:16px;padding:20px;margin-bottom:20px;border:2px solid var(--accent)">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                <span style="font-size:36px;font-weight:800;color:var(--accent)">${data.word}</span>
                ${data.phonetic ? `<span style="color:var(--text3);font-size:18px;font-style:italic">${data.phonetic}</span>` : ''}
                ${data.audio ? `<button onclick="speakWord('${data.word}')" style="background:var(--accent);border:none;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">🔊</button>` : ''}
            </div>
            ${data.turkish ? `<div style="font-size:20px;color:var(--text);font-weight:600;border-top:1px solid var(--border);padding-top:12px;margin-top:4px">${data.turkish}</div>` : ''}
        </div>`;
    
    for (let i = 0; i < data.meanings.length; i++) {
        const m = data.meanings[i];
        html += `<div style="margin-bottom:20px;padding:16px;background:var(--card);border-radius:14px;border:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <span style="background:var(--accent);color:white;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase">${m.partOfSpeech}</span>
                <span style="font-size:12px;color:var(--text3)">Anlam ${i + 1}</span>
            </div>`;
        
        if (m.definitions.length > 0) {
            html += `<div style="margin-bottom:12px">
                <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:6px">📖 TANIMLAR</div>`;
            m.definitions.forEach((def, idx) => {
                html += `<div style="display:flex;gap:8px;margin-bottom:8px;padding:10px;background:var(--bg);border-radius:8px">
                    <span style="background:var(--accent);color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${idx + 1}</span>
                    <span style="font-size:14px;color:var(--text);line-height:1.5">${def}</span>
                </div>`;
            });
            html += `</div>`;
        }
        
        if (m.example) {
            html += `<div style="margin-bottom:12px;padding:12px;background:rgba(98,129,65,0.1);border-radius:8px;border-left:3px solid var(--accent)">
                <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px">💬 ÖRNEK CÜMLE</div>
                <div style="font-size:14px;color:var(--text);font-style:italic">"${m.example}"</div>
            </div>`;
        }
        
        if (m.synonyms.length > 0) {
            html += `<div style="margin-bottom:10px">
                <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:6px">🔗 EŞ ANLAMLILAR</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">${m.synonyms.map(s => `<span onclick="dictSearchWord('${s}')" style="background:rgba(46,204,113,0.15);color:#27ae60;padding:6px 12px;border-radius:16px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(46,204,113,0.3)">${s}</span>`).join('')}</div>
            </div>`;
        }
        
        if (m.antonyms.length > 0) {
            html += `<div>
                <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:6px">↔️ ZIT ANLAMLILAR</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">${m.antonyms.map(s => `<span onclick="dictSearchWord('${s}')" style="background:rgba(231,76,60,0.15);color:#e74c3c;padding:6px 12px;border-radius:16px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid rgba(231,76,60,0.3)">${s}</span>`).join('')}</div>
            </div>`;
        }
        html += `</div>`;
    }
    html += `</div>`;
    resultEl.innerHTML = html;
    document.getElementById('dict-input').value = word;
}

function clearDictHistory() {
    dictHistory = [];
    _saveDictHistory();
    renderDict();
}