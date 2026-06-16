// engine_v3.js
// 昔の app.py の search() を忠実に JS 移植した版

/* =========================
   50音・マッピング
   ========================= */

const KANA_LIST =
  "アイウエオ" +
  "カキクケコ" +
  "ガギグゲゴ" +
  "サシスセソ" +
  "ザジズゼゾ" +
  "タチツテト" +
  "ダヂヅデド" +
  "ナニヌネノ" +
  "ハヒフヘホ" +
  "バビブベボ" +
  "パピプペポ" +
  "マミムメモ" +
  "ヤユヨ" +
  "ラリルレロ" +
  "ワン";

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

/* =========================
   ユーティリティ
   ========================= */

function toKatakana(text) {
  if (!text) return "";
  return text.replace(/[ぁ-ん]/g, c =>
    String.fromCharCode(c.charCodeAt(0) + 0x60)
  );
}

function getBaseChar(c, unifySmall = false, unifyDaku = false, unifyHandaku = false) {
  let res = unifySmall ? (SMALL_TO_LARGE[c] || c) : c;
  if (unifyDaku) res = REV_DAKU[res] || res;
  if (unifyHandaku) res = REV_HANDAKU[res] || res;
  return res;
}

function getCleanChar(w, pos = "head", offset = 0, unifyS = false, unifyD = false, unifyH = false) {
  const text = w.replace(/ー/g, "");
  if (!text) return "";
  try {
    const idx = pos === "head" ? offset : text.length - 1 - offset;
    const ch = text[idx];
    return getBaseChar(ch, unifyS, unifyD, unifyH);
  } catch {
    return "";
  }
}

function shiftKana(char, n) {
  const idx = KANA_LIST.indexOf(char);
  if (idx === -1) return char;
  const len = KANA_LIST.length;
  return KANA_LIST[(idx + n + len) % len];
}

function getVariants(char, allowDaku, allowHandaku, unify = false) {
  const base = unify ? (SMALL_TO_LARGE[char] || char) : char;
  const variants = new Set([base]);

  if (allowDaku) {
    for (const [k, v] of Object.entries(DAKU_MAP)) {
      if (base === k) variants.add(v);
      if (base === v) variants.add(k);
    }
  }
  if (allowHandaku) {
    for (const [k, v] of Object.entries(HANDAKU_MAP)) {
      if (base === k) variants.add(v);
      if (base === v) variants.add(k);
    }
  }
  return variants;
}

/* =========================
   メイン探索関数
   ========================= */
/**
 * d: {
 *   start_word, start_char, all_start_char, must_char,
 *   end_char, all_end_char, exclude_chars, ban_start_chars,
 *   valid_chars, len_mode, max_len, pos_shift,
 *   use_shift, ks_abs, shift_mode,
 *   allow_daku, allow_handaku, auto_recovery,
 *   char_limit_mode, unify_small, round_trip,
 *   exclude_conjugate,
 *   categories, red_words, blue_words,
 *   group_constraints, choice_constraints,
 *   once_constraint, target_total_len,
 *   timeout, limit, limit_enabled,
 *   unify_scope, sort_mode,
 *   exclusive_choice
 * }
 *
 * 戻り値: { routes: string[][], count: number }
 */
function searchRoutes(d) {
  // タイムアウト・件数
  const timeout = parseInt(d.timeout ?? 15, 10);
  const limit = parseInt(d.limit ?? 1500, 10);
  const limitEnabled = d.limit_enabled !== false; // デフォルト True

  const maxLen = parseInt(d.max_len ?? 5, 10);
  const pShift = parseInt(d.pos_shift ?? 0, 10);

  const useShift = !!d.use_shift;
  const ksVal = parseInt(d.ks_abs ?? 1, 10);
  const shiftMode = d.shift_mode || "abs";

  const uSmall = !!d.unify_small;
  const uDaku = !!d.allow_daku;
  const uHandaku = !!d.allow_handaku;
  const scope = d.unify_scope || "all";

  const connS = uSmall && (scope === "all" || scope === "conn");
  const connD = uDaku && (scope === "all" || scope === "conn");
  const connH = uHandaku && (scope === "all" || scope === "conn");

  const filtS = uSmall && (scope === "all" || scope === "filter");
  const filtD = uDaku && (scope === "all" || scope === "filter");
  const filtH = uHandaku && (scope === "all" || scope === "filter");

  const lenMode = d.len_mode || "free";

  const rawValid = toKatakana(d.valid_chars || "");
  const validChars = rawValid
    ? new Set(rawValid.replace(/[、,]/g, ""))
    : null;

  const redWords = new Set(d.red_words || []);
  const blueWords = new Set(d.blue_words || []);

  const asc = (toKatakana(d.all_start_char || "").split(/[、,]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(c => getCleanChar(c, "head", 0, filtS, filtD, filtH)));

  const aec = (toKatakana(d.all_end_char || "").split(/[、,]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(c => getCleanChar(c, "head", 0, filtS, filtD, filtH)));

  const exList = (toKatakana(d.exclude_chars || "").split(/[、,]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(c => getBaseChar(c, filtS, filtD, filtH)));

  const bsList = (toKatakana(d.ban_start_chars || "").split(/[、,]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(c => getBaseChar(c, filtS, filtD, filtH)));

  const mustChars = (toKatakana(d.must_char || "").split(/[、,]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(c => getBaseChar(c, filtS, filtD, filtH)));

  const startWord = toKatakana(d.start_word || "");
  const startChar = getCleanChar(
    toKatakana(d.start_char || ""),
    "head",
    0,
    filtS,
    filtD,
    filtH
  );
  const endChar = getCleanChar(
    toKatakana(d.end_char || ""),
    "head",
    0,
    filtS,
    filtD,
    filtH
  );

  // 辞書プール
  let rawPool = [];
  const cats = d.categories && d.categories.length
    ? d.categories
    : ["country"];

  cats.forEach(c => {
    const arr = (window.DICTIONARY_MASTER && DICTIONARY_MASTER[c]) || [];
    rawPool = rawPool.concat(arr);
  });
  rawPool = Array.from(new Set(rawPool)).map(toKatakana);

  // temp_pool フィルタ
  const tempPool = [];
  for (const w of rawPool) {
    if (redWords.has(w)) continue;

    if (validChars) {
      const clean = w.replace(/ー/g, "");
      let ok = true;
      for (const ch of clean) {
        const b = getBaseChar(ch, filtS, filtD, filtH);
        if (!validChars.has(b)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }

    const hChar = getCleanChar(w, "head", 0, filtS, filtD, filtH);
    const tChar = getCleanChar(w, "tail", 0, filtS, filtD, filtH);

    if (asc.length && !asc.includes(hChar)) continue;
    if (aec.length && !aec.includes(tChar)) continue;

    const normW = w.split("").map(c => getBaseChar(c, filtS, filtD, filtH)).join("");
    if (exList.length && exList.some(ex => normW.includes(ex))) continue;
    if (bsList.length && bsList.some(bs => hChar === bs)) continue;

    tempPool.push(w);
  }

  // 共役排除
  let wordPool;
  if (d.exclude_conjugate) {
    const pairMap = new Map();
    for (const w of tempPool) {
      const ch = getCleanChar(w, "head", 0, connS, connD, connH);
      const ct = getCleanChar(w, "tail", 0, connS, connD, connH);
      const key = `${ch}_${ct}`;
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key).push(w);
    }
    wordPool = [];
    for (const arr of pairMap.values()) {
      if (arr.length === 1) wordPool.push(arr[0]);
    }
  } else {
    wordPool = tempPool.slice();
  }

  // インデックス
  const headIndex = new Map();
  const tailIndex = new Map();
  for (const w of wordPool) {
    const h = getCleanChar(w, "head", 0, connS, connD, connH);
    const t = getCleanChar(w, "tail", 0, connS, connD, connH);
    if (!headIndex.has(h)) headIndex.set(h, []);
    if (!tailIndex.has(t)) tailIndex.set(t, []);
    headIndex.get(h).push(w);
    tailIndex.get(t).push(w);
  }

  const results = [];
  const startTime = performance.now();

  function checkTimeoutOrLimit() {
    if ((performance.now() - startTime) / 1000 > timeout) return true;
    if (limitEnabled && results.length >= limit) return true;
    return false;
  }

  function solve(path, currentTotalLen) {
    if (checkTimeoutOrLimit()) return;

    if (lenMode === "diff" && path.length > 1) {
      const lens = path.map(x => x.length);
      const setLen = new Set(lens);
      if (lens.length !== setLen.size) return;
    }

    if (path.length === maxLen) {
      if (lenMode === "same") {
        const lens = path.map(x => x.length);
        const setLen = new Set(lens);
        if (setLen.size > 1) return;
      }

      const pathSet = new Set(path);
      for (const bw of blueWords) {
        if (!pathSet.has(bw)) return;
      }

      const normT = path.join("").split("")
        .map(c => getBaseChar(c, filtS, filtD, filtH))
        .join("");

      function checkList(lst) {
        if (!lst || !lst.length) return true;
        for (const group of lst) {
          let targetCnt = 1;
          let gShift = 0;
          const items = [];
          for (const itm of group) {
            if (itm.includes(":")) {
              const ps = itm.split(":");
              const right = ps[1];
              if (right && right.toUpperCase() === "S") {
                gShift = parseInt(ps[0] || "0", 10);
              } else {
                targetCnt = parseInt(right || "1", 10);
              }
            } else {
              items.push(itm);
            }
          }
          let total = 0;
          for (const it of items) {
            const shifted = it.split("")
              .map(c => shiftKana(c, gShift))
              .map(c => getBaseChar(c, filtS, filtD, filtH))
              .join("");
            const re = new RegExp(shifted, "g");
            const matches = normT.match(re);
            total += matches ? matches.length : 0;
          }
          if (d.exclusive_choice) {
            if (total !== targetCnt) return false;
          } else {
            if (total < targetCnt) return false;
          }
        }
        return true;
      }

      if (!checkList(d.group_constraints || [])) return;
      if (!checkList(d.choice_constraints || [])) return;

      if (mustChars.length) {
        for (const mc of mustChars) {
          const cnt = (normT.match(new RegExp(mc, "g")) || []).length;
          if (cnt < 1) return;
          if (d.once_constraint && cnt !== 1) return;
        }
      }

      if (d.target_total_len) {
        const tgt = parseInt(d.target_total_len, 10);
        if (currentTotalLen !== tgt) return;
      }

      if (endChar) {
        const lastTail = getCleanChar(
          path[path.length - 1],
          "tail",
          0,
          connS,
          connD,
          connH
        );
        const vars = getVariants(endChar, uDaku, uHandaku, connS);
        if (!vars.has(lastTail)) return;
      }

      results.push(path.slice());
      return;
    }

    const isOdd = path.length % 2 !== 0;
    const lastWord = path[path.length - 1];
    const lastClean = lastWord.replace(/ー/g, "");

    const baseOffsets = [pShift];
    if (d.auto_recovery) {
      for (let i = pShift + 1; i < lastClean.length; i++) {
        baseOffsets.push(i);
      }
    }

    for (const off of baseOffsets) {
      const pos = (!d.round_trip || isOdd) ? "tail" : "head";
      const src = getCleanChar(lastWord, pos, off, connS, connD, connH);
      if (!src) continue;

      let rawTargets = new Set([src]);
      if (useShift) {
        if (shiftMode === "abs") {
          rawTargets = new Set([
            shiftKana(src, Math.abs(ksVal)),
            shiftKana(src, -Math.abs(ksVal))
          ]);
        } else {
          rawTargets = new Set([shiftKana(src, ksVal)]);
        }
      }

      const targets = new Set();
      for (const rt of rawTargets) {
        for (const v of getVariants(rt, uDaku, uHandaku, connS)) {
          targets.add(v);
        }
      }

      let found = false;
      for (const tc of targets) {
        const idxMap = (d.round_trip && isOdd) ? tailIndex : headIndex;
        const cands = idxMap.get(tc) || [];
        for (const nxt of cands) {
          if (path.includes(nxt)) continue;

          if (d.char_limit_mode) {
            const pTxt = path.join("").split("")
              .map(c => getBaseChar(c, filtS, filtD, filtH))
              .join("");
            const nTxt = nxt.split("")
              .map(c => getBaseChar(c, filtS, filtD, filtH))
              .join("");
            const setP = new Set(pTxt.split(""));
            const setN = new Set(nTxt.split(""));
            let intersect = false;
            for (const ch of setN) {
              if (setP.has(ch)) {
                intersect = true;
                break;
              }
            }
            if (intersect) continue;
          }

          found = true;
          solve(path.concat(nxt), currentTotalLen + nxt.length);
          if (checkTimeoutOrLimit()) return;
        }
      }
      if (found) break;
    }
  }

  // 開始語
  let starts;
  if (startWord && wordPool.includes(startWord)) {
    starts = [startWord];
  } else {
    starts = wordPool.slice();
  }
  starts.sort();

  for (const w of starts) {
    if (!startWord && startChar) {
      const h = getCleanChar(w, "head", 0, filtS, filtD, filtH);
      if (h !== startChar) continue;
    }
    solve([w], w.length);
    if (checkTimeoutOrLimit()) break;
  }

  const sm = d.sort_mode || "default";
  if (sm === "kana") {
    results.sort((a, b) => a.join("").localeCompare(b.join("")));
  } else if (sm === "len_asc") {
    results.sort((a, b) => a.join("").length - b.join("").length);
  } else if (sm === "len_desc") {
    results.sort((a, b) => b.join("").length - a.join("").length);
  } else if (sm === "random") {
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [results[i], results[j]] = [results[j], results[i]];
    }
  }

  return { routes: results, count: results.length };
}

// 必要ならグローバルに公開
window.searchRoutes = searchRoutes;
