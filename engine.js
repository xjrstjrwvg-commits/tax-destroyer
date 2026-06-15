/* =========================
   探索エンジン 共通ユーティリティ
   ========================= */

const KANA_LIST =
  "アイウエオ" +
  "カキクケコガギグゲゴ" +
  "サシスセソザジズゼゾ" +
  "タチツテトダヂヅデド" +
  "ナニヌネノ" +
  "ハヒフヘホバビブベボパピプペポ" +
  "マミムメモ" +
  "ヤユヨ" +
  "ラリルレロ" +
  "ワヲン";

const SMALL_TO_LARGE = {
  "ァ": "ア", "ィ": "イ", "ゥ": "ウ", "ェ": "エ", "ォ": "オ",
  "ッ": "ツ", "ャ": "ヤ", "ュ": "ユ", "ョ": "ヨ", "ヮ": "ワ"
};

const DAKU_MAP = {
  "カ": "ガ", "キ": "ギ", "ク": "グ", "ケ": "ゲ", "コ": "ゴ",
  "サ": "ザ", "シ": "ジ", "ス": "ズ", "セ": "ゼ", "ソ": "ゾ",
  "タ": "ダ", "チ": "ヂ", "ツ": "ヅ", "テ": "デ", "ト": "ド",
  "ハ": "バ", "ヒ": "ビ", "フ": "ブ", "ヘ": "ベ", "ホ": "ボ"
};

const HANDAKU_MAP = {
  "ハ": "パ", "ヒ": "ピ", "フ": "プ", "ヘ": "ペ", "ホ": "ポ"
};

const REV_DAKU = {};
for (const k in DAKU_MAP) REV_DAKU[DAKU_MAP[k]] = k;

const REV_HANDAKU = {};
for (const k in HANDAKU_MAP) REV_HANDAKU[HANDAKU_MAP[k]] = k;

function toKatakana(text) {
  if (!text) return "";
  return text.replace(/[ぁ-ん]/g, c =>
    String.fromCharCode(c.charCodeAt(0) + 0x60)
  );
}

function getBaseChar(c, unifySmall, unifyDaku, unifyHandaku) {
  let res = unifySmall ? (SMALL_TO_LARGE[c] || c) : c;
  if (unifyDaku) res = REV_DAKU[res] || res;
  if (unifyHandaku) res = REV_HANDAKU[res] || res;
  return res;
}

function getCleanChar(w, pos, offset, unifySmall, unifyDaku, unifyHandaku) {
  const text = w.replace(/ー/g, "");
  if (!text) return "";
  try {
    const idx = pos === "head" ? offset : text.length - 1 - offset;
    const c = text[idx];
    return getBaseChar(c, unifySmall, unifyDaku, unifyHandaku);
  } catch {
    return "";
  }
}

function shiftKana(c, n) {
  const idx = KANA_LIST.indexOf(c);
  if (idx === -1) return c;
  return KANA_LIST[(idx + n + KANA_LIST.length) % KANA_LIST.length];
}

function getVariants(c, allowDaku, allowHandaku, unifySmall) {
  const base = unifySmall ? (SMALL_TO_LARGE[c] || c) : c;
  const s = new Set([base]);
  if (allowDaku) {
    for (const [k, v] of Object.entries(DAKU_MAP)) {
      if (base === k) s.add(v);
      if (base === v) s.add(k);
    }
  }
  if (allowHandaku) {
    for (const [k, v] of Object.entries(HANDAKU_MAP)) {
      if (base === k) s.add(v);
      if (base === v) s.add(k);
    }
  }
  return s;
}

/* =========================
   探索エンジン本体（Python app.py → JS 完全移植）
   ========================= */

function searchRoutes(d) {
  const maxLen = parseInt(d.max_len || 5, 10);

  const posShift = parseInt(d.pos_shift || 0, 10);
  const useShift = !!d.use_shift;
  const ksAbs = parseInt(d.ks_abs || 1, 10);
  const shiftMode = d.shift_mode || "abs";

  const unifySmall = !!d.unify_small;
  const allowDaku = !!d.allow_daku;
  const allowHandaku = !!d.allow_handaku;
  const unifyScope = d.unify_scope || "all";

  const lenMode = d.len_mode || "free";
  const sortMode = d.sort_mode || "default";

  let targetTotalLen = d.ttl;
  if (targetTotalLen === "" || targetTotalLen === null || targetTotalLen === "0" || targetTotalLen === 0) {
    targetTotalLen = null;
  } else {
    targetTotalLen = parseInt(targetTotalLen, 10);
  }

  const timeoutEnabled = !!d.timeout_enabled;
  const timeoutSec = parseFloat(d.timeout_sec || 15);

  const limitEnabled = !!d.limit_enabled;
  const limit = d.limit && d.limit !== "0" ? parseInt(d.limit, 10) : 0;

  const excludeConjugate = !!d.exclude_conjugate;

  const connS = unifySmall && (unifyScope === "all" || unifyScope === "conn");
  const connD = allowDaku && (unifyScope === "all" || unifyScope === "conn");
  const connH = allowHandaku && (unifyScope === "all" || unifyScope === "conn");

  const filtS = unifySmall && (unifyScope === "all" || unifyScope === "filter");
  const filtD = allowDaku && (unifyScope === "all" || unifyScope === "filter");
  const filtH = allowHandaku && (unifyScope === "all" || unifyScope === "filter");

  const startWord = toKatakana(d.start_word || "").trim();

  const startChar = getCleanChar(
    toKatakana(d.start_char || ""), "head", 0, filtS, filtD, filtH
  );
  const endChar = getCleanChar(
    toKatakana(d.end_char || ""), "head", 0, filtS, filtD, filtH
  );

  const asc = (toKatakana(d.all_start_char || "").split(/[,、]/)
    .map(s => s.trim()).filter(Boolean)
    .map(c => getCleanChar(c, "head", 0, filtS, filtD, filtH)));

  const aec = (toKatakana(d.all_end_char || "").split(/[,、]/)
    .map(s => s.trim()).filter(Boolean)
    .map(c => getCleanChar(c, "head", 0, filtS, filtD, filtH)));

  const validCharsRaw = toKatakana(d.valid_chars || "").replace(/[、,]/g, "");
  const validChars = validCharsRaw ? new Set(validCharsRaw.split("")) : null;

  const excludeChars = toKatakana(d.exclude_chars || "").split(/[,、]/)
    .map(s => s.trim()).filter(Boolean)
    .map(c => getBaseChar(c, filtS, filtD, filtH));

  const banStartChars = toKatakana(d.ban_start_chars || "").split(/[,、]/)
    .map(s => s.trim()).filter(Boolean)
    .map(c => getBaseChar(c, filtS, filtD, filtH));

  // must_char
  const mustSpecs = [];
  const mcRaw = toKatakana(d.must_char || "");
  mcRaw.split(/[,、]/).map(s => s.trim()).filter(Boolean).forEach(token => {
    if (token.includes(":")) {
      const [ch, n] = token.split(":");
      mustSpecs.push([getBaseChar(ch.trim(), filtS, filtD, filtH), ">=", parseInt(n, 10)]);
    } else if (token.includes("=")) {
      const [ch, n] = token.split("=");
      mustSpecs.push([getBaseChar(ch.trim(), filtS, filtD, filtH), "==", parseInt(n, 10)]);
    } else {
      mustSpecs.push([getBaseChar(token, filtS, filtD, filtH), ">=", 1]);
    }
  });

  /* ここまで Part1（前半） */
  /* ==== Part1 の続き ==== */

  // 辞書プール（dictionary.js の DICTIONARY_MASTER を使用）
  let rawPool = [];
  (d.categories || ["country"]).forEach(cat => {
    rawPool = rawPool.concat((window.DICTIONARY_MASTER && DICTIONARY_MASTER[cat]) || []);
  });
  rawPool = Array.from(new Set(rawPool));

  const redWords = new Set(d.red_words || []);
  const blueWords = new Set(d.blue_words || []);

  // フィルタリング
  let tempPool = [];
  for (const w of rawPool) {
    if (redWords.has(w)) continue;

    const wk = toKatakana(w);
    const h = getCleanChar(wk, "head", 0, filtS, filtD, filtH);
    const t = getCleanChar(wk, "tail", 0, filtS, filtD, filtH);

    if (asc.length && !asc.includes(h)) continue;
    if (aec.length && !aec.includes(t)) continue;

    if (validChars) {
      let ok = true;
      for (const c of wk.replace(/ー/g, "")) {
        const bc = getBaseChar(c, filtS, filtD, filtH);
        if (!validChars.has(bc)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }

    const normW = wk.split("").map(c => getBaseChar(c, filtS, filtD, filtH)).join("");
    if (excludeChars.some(ex => normW.includes(ex))) continue;
    if (banStartChars.some(bs => h === bs)) continue;

    tempPool.push(wk);
  }

  // 共役排除
  let wordPool;
  if (excludeConjugate) {
    const pairMap = {};
    for (const w of tempPool) {
      const ch = getCleanChar(w, "head", 0, connS, connD, connH);
      const ct = getCleanChar(w, "tail", 0, connS, connD, connH);
      const key = `${ch}_${ct}`;
      if (!pairMap[key]) pairMap[key] = [];
      pairMap[key].push(w);
    }
    wordPool = Object.values(pairMap).map(v => v[0]);
  } else {
    wordPool = tempPool;
  }

  // 接続インデックス
  const headIndex = {};
  const tailIndex = {};
  for (const w of wordPool) {
    const h = getCleanChar(w, "head", 0, connS, connD, connH);
    const t = getCleanChar(w, "tail", 0, connS, connD, connH);
    if (!headIndex[h]) headIndex[h] = [];
    if (!tailIndex[t]) tailIndex[t] = [];
    headIndex[h].push(w);
    tailIndex[t].push(w);
  }

  const results = [];
  const startTime = performance.now();
  let timeoutFlag = false;
  let limitFlag = false;

  function timedOut() {
    if (!timeoutEnabled) return false;
    return (performance.now() - startTime) / 1000 > timeoutSec;
  }

  function limitReached() {
    if (!limitEnabled || limit <= 0) return false;
    return results.length >= limit;
  }

  function solve(path, totalLen) {
    if (timeoutFlag || limitFlag) return;
    if (timedOut()) {
      timeoutFlag = true;
      return;
    }
    if (limitReached()) {
      limitFlag = true;
      return;
    }

    if (path.length === maxLen) {
      const lens = new Set(path.map(w => w.length));
      if (lenMode === "same" && lens.size > 1) return;
      if (lenMode === "diff" && lens.size !== path.length) return;

      const pathSet = new Set(path);
      for (const bw of blueWords) {
        if (!pathSet.has(bw)) return;
      }

      if (targetTotalLen !== null && totalLen !== targetTotalLen) return;

      if (endChar) {
        const lastT = getCleanChar(path[path.length - 1], "tail", 0, connS, connD, connH);
        const variants = getVariants(endChar, allowDaku, allowHandaku, connS);
        if (!variants.has(lastT)) return;
      }

      const joined = path.join("");
      const normJoin = joined.split("").map(c => getBaseChar(c, filtS, filtD, filtH)).join("");
      for (const [ch, op, n] of mustSpecs) {
        const cnt = normJoin.split("").filter(c => c === ch).length;
        if (op === ">=" && cnt < n) return;
        if (op === "==" && cnt !== n) return;
      }

      results.push([...path]);
      return;
    }

    const last = path[path.length - 1];
    const lastClean = last.replace(/ー/g, "");
    const isOdd = (path.length % 2 !== 0);

    const offsets = [posShift];
    if (d.auto_recovery) {
      for (let i = posShift + 1; i < lastClean.length; i++) offsets.push(i);
    }

    for (const off of offsets) {
      if (timeoutFlag || limitFlag) return;

      let pos = "tail";
      if (d.round_trip && isOdd) pos = "head";

      const src = getCleanChar(last, pos, off, connS, connD, connH);
      if (!src) continue;

      let rawTargets = new Set([src]);
      if (useShift) {
        rawTargets = new Set();
        if (shiftMode === "abs") {
          rawTargets.add(shiftKana(src, ksAbs));
          rawTargets.add(shiftKana(src, -ksAbs));
        } else {
          rawTargets.add(shiftKana(src, ksAbs));
        }
      }

      const targets = new Set();
      for (const rt of rawTargets) {
        for (const v of getVariants(rt, allowDaku, allowHandaku, connS)) {
          targets.add(v);
        }
      }

      const index = (d.round_trip && isOdd) ? tailIndex : headIndex;

      for (const tc of targets) {
        const cands = index[tc] || [];
        for (const nxt of cands) {
          if (path.includes(nxt)) continue;

          if (d.char_limit_mode) {
            const used = path.join("");
            const usedNorm = used.split("").map(c => getBaseChar(c, filtS, filtD, filtH)).join("");
            const nxtNorm = nxt.split("").map(c => getBaseChar(c, filtS, filtD, filtH)).join("");
            const usedSet = new Set(usedNorm.split(""));
            const nxtSet = new Set(nxtNorm.split(""));
            let conflict = false;
            for (const c of nxtSet) {
              if (usedSet.has(c)) {
                conflict = true;
                break;
              }
            }
            if (conflict) continue;
          }

          solve([...path, nxt], totalLen + nxt.length);
          if (timeoutFlag || limitFlag) return;
        }
      }
    }
  }

  let starts;
  if (startWord && wordPool.includes(startWord)) {
    starts = [startWord];
  } else {
    starts = [...wordPool];
  }
  starts.sort();

  for (const w of starts) {
    if (startChar) {
      const h = getCleanChar(w, "head", 0, filtS, filtD, filtH);
      if (h !== startChar) continue;
    }
    solve([w], w.length);
    if (timeoutFlag || limitFlag) break;
  }

  if (sortMode === "kana") {
    results.sort((a, b) => a.join("").localeCompare(b.join("")));
  } else if (sortMode === "len_asc") {
    results.sort((a, b) => a.join("").length - b.join("").length);
  } else if (sortMode === "len_desc") {
    results.sort((a, b) => b.join("").length - a.join("").length);
  } else if (sortMode === "random") {
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [results[i], results[j]] = [results[j], results[i]];
    }
  }

  return {
    routes: results,
    count: results.length,
    timeout: timeoutFlag,
    limited: limitFlag
  };
}

/* =========================
   UI ロジック（index.html と連携）
   ========================= */

let currentRoutes = [];
let wordStates = {};

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  saveSettings();
}

function adjustVal(id, delta) {
  const el = document.getElementById(id);
  el.value = Math.max(0, parseInt(el.value || 0) + delta);
  saveSettings();
}

function getWordStyle(state) {
  if (state === 'red') return "background-color:#f43f5e;color:white;border-color:#e11d48;";
  if (state === 'blue') return "background-color:#2563eb;color:white;border-color:#1d4ed8;";
  return "";
}

function init() {
  if (localStorage.ultraSettings) {
    const s = JSON.parse(localStorage.ultraSettings);

    const fields = [
      'sw','sc','asc','mc','ec','aec','exc','bsc','ml','ps','ks_abs','ttl',
      'sort_mode','unify_scope','copy_limit','valid_chars','len_mode',
      'timeout_sec','limit'
    ];
    fields.forEach(f => {
      if (s[f] !== undefined && document.getElementById(f))
        document.getElementById(f).value = s[f];
    });

    const checks = [
      'allow_daku','allow_handaku','char_limit_mode','auto_recovery','unify_small',
      'rt','use_shift','exclude_conjugate','timeout_enabled','limit_enabled',
      'realtime_enabled'
    ];
    checks.forEach(f => {
      if (s[f] !== undefined && document.getElementById(f))
        document.getElementById(f).checked = s[f];
    });

    if (s.dark_mode) document.documentElement.classList.add('dark');
    if (s.wordStates) wordStates = s.wordStates;
  }

  loadDictionaryUI();
}

function loadDictionaryUI() {
  const cats = Array.from(document.querySelectorAll('input[name="cat"]:checked')).map(c => c.value);

  let words = [];
  cats.forEach(c => {
    words = words.concat((window.DICTIONARY_MASTER && DICTIONARY_MASTER[c]) || []);
  });
  words = Array.from(new Set(words)).sort();

  const list = document.getElementById('dict-list');
  if (!list) return;

  list.innerHTML = words.map(w => {
    const s = wordStates[w] || 'white';
    return `<button onclick="toggleWordState(this,'${w}')"
            class="p-2 rounded-lg border text-[10px] font-bold"
            style="${getWordStyle(s)}">${w}</button>`;
  }).join('');
}

function toggleWordState(btn, word) {
  const states = { white:'red', red:'blue', blue:'white' };
  wordStates[word] = states[wordStates[word] || 'white'];
  saveSettings();
  loadDictionaryUI();
}

function bulkSet(state) {
  const cats = Array.from(document.querySelectorAll('input[name="cat"]:checked')).map(c => c.value);
  cats.forEach(c => {
    ((window.DICTIONARY_MASTER && DICTIONARY_MASTER[c]) || []).forEach(w => { wordStates[w] = state; });
  });
  saveSettings();
  loadDictionaryUI();
}

function saveSettings() {
  localStorage.ultraSettings = JSON.stringify({
    sw: sw.value, sc: sc.value, asc: asc.value, mc: mc.value, ec: ec.value,
    aec: aec.value, exc: exc.value, bsc: bsc.value, ml: ml.value,
    ps: ps.value, ks_abs: ks_abs.value, ttl: ttl.value,
    sort_mode: sort_mode.value, unify_scope: unify_scope.value,
    copy_limit: copy_limit.value, valid_chars: valid_chars.value,
    len_mode: (window.len_mode?.value || "free"),
    timeout_sec: timeout_sec.value, limit: limit.value,

    allow_daku: allow_daku.checked, allow_handaku: allow_handaku.checked,
    char_limit_mode: char_limit_mode.checked, auto_recovery: auto_recovery.checked,
    unify_small: unify_small.checked, rt: rt.checked, use_shift: use_shift.checked,
    exclude_conjugate: exclude_conjugate.checked,
    timeout_enabled: timeout_enabled.checked,
    limit_enabled: limit_enabled.checked,
    realtime_enabled: realtime_enabled.checked,

    dark_mode: document.documentElement.classList.contains('dark'),
    wordStates: wordStates
  });
}

function resetSettings() {
  localStorage.removeItem('ultraSettings');
  location.reload();
}

function run() {
  const btn = document.getElementById('btn');
  btn.innerText = "EXPLORING...";
  btn.disabled = true;

  try {
    const body = {
      start_word: sw.value,
      start_char: sc.value,
      all_start_char: asc.value,
      must_char: mc.value,
      end_char: ec.value,
      all_end_char: aec.value,
      exclude_chars: exc.value,
      ban_start_chars: bsc.value,
      valid_chars: valid_chars.value,
      len_mode: (window.len_mode?.value || "free"),
      max_len: ml.value,
      pos_shift: parseInt(ps.value || 0),
      use_shift: use_shift.checked,
      ks_abs: parseInt(ks_abs.value),
      shift_mode: "abs",

      allow_daku: allow_daku.checked,
      allow_handaku: allow_handaku.checked,
      auto_recovery: auto_recovery.checked,
      char_limit_mode: char_limit_mode.checked,
      unify_small: unify_small.checked,
      round_trip: rt.checked,
      exclude_conjugate: exclude_conjugate.checked,

      timeout_enabled: timeout_enabled.checked,
      timeout_sec: parseFloat(timeout_sec.value),
      limit_enabled: limit_enabled.checked,
      limit: parseInt(limit.value),

      categories: Array.from(document.querySelectorAll('input[name="cat"]:checked')).map(c => c.value),
      red_words: Object.keys(wordStates).filter(k => wordStates[k] === 'red'),
      blue_words: Object.keys(wordStates).filter(k => wordStates[k] === 'blue'),

      ttl: ttl.value
    };

    const d = searchRoutes(body);
    currentRoutes = d.routes || [];
    display();

  } finally {
    btn.innerText = "Explore";
    btn.disabled = false;
  }
}

function display() {
  const resEl = document.getElementById('res');
  if (!resEl) return;

  resEl.innerHTML = currentRoutes.map((rt, i) => `
    <div class="glass p-4 rounded-2xl">
      <div class="flex justify-between text-[10px] font-black text-slate-400">
        <span>#${i+1}</span>
        <button onclick="copyOne(${i})" class="text-blue-600">Copy</button>
      </div>
      <div class="font-bold text-sm">${rt.join(' → ')}</div>
      <div class="text-[9px] font-black text-blue-500">${rt.join('').length} letters</div>
    </div>
  `).join('');

  const statsEl = document.getElementById('stats');
  if (!statsEl) return;

  if (realtime_enabled.checked) {
    statsEl.innerText = `${currentRoutes.length} ROUTES FOUND`;
    statsEl.classList.remove('hidden');
  } else {
    statsEl.classList.add('hidden');
  }
}

function copyOne(i) {
  if (!currentRoutes[i]) return;
  navigator.clipboard.writeText(currentRoutes[i].join(' → '));
}

function copyTopN() {
  const n = parseInt(copy_limit.value);
  navigator.clipboard.writeText(
    currentRoutes.slice(0, n).map(rt => rt.join(' → ')).join('\n')
  );
}

window.onload = init;
