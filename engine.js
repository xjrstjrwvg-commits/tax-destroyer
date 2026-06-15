/* ============================================================
   ULTRA ENGINE Pro – Static Edition
   engine.js（完全移植版）
   ============================================================ */

/* ------------------------------
   1. ユーティリティ
------------------------------ */

// カタカナ変換
function hiraToKata(str) {
    return str.replace(/[\u3041-\u3096]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
}

// 文字を配列化
function toCharArray(word) {
    return [...word];
}

// 必須文字パース（ア=2 / ア:2 / 〇=7）
function parseRequiredChars(input) {
    if (!input) return {};
    const result = {};
    const parts = input.split(/[,、\s]+/);

    for (const part of parts) {
        if (!part) continue;

        const m = part.match(/^(.+?)[=:：](\d+)$/);
        if (m) {
            result[m[1]] = Number(m[2]);
        } else {
            result[part] = 1;
        }
    }
    return result;
}

/* ------------------------------
   2. 検索エンジン本体
------------------------------ */

function searchRoutes(options) {
    const {
        requiredChars,
        excludeConjugation,
        mergeConjugation,
        lengthMode,
        exactLimit,
        hiraganaToKatakana,
        blueIsRequired,
        backwardLink,
        gyukou,
        noSingleLoop,
        limit,
        timeout
    } = options;

    const startTime = performance.now();
    const results = [];

    const dict = DICTIONARY_MASTER.country.concat(DICTIONARY_MASTER.capital);

    for (let word of dict) {

        if (hiraganaToKatakana) {
            word = hiraToKata(word);
        }

        const chars = toCharArray(word);

        // 必須文字チェック
        let ok = true;
        for (const key in requiredChars) {
            const need = requiredChars[key];
            const count = chars.filter(c => c === key).length;
            if (count < need) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;

        // 文字数構成
        if (lengthMode === "strict") {
            if (chars.length !== Object.values(requiredChars).reduce((a, b) => a + b, 0)) {
                continue;
            }
        }

        // 1文字ループ拒否
        if (noSingleLoop && chars.length === 1) continue;

        results.push(word);

        if (limit && results.length >= limit) break;
        if (timeout && performance.now() - startTime > timeout) break;
    }

    return results;
}

/* ------------------------------
   3. UI ロジック
------------------------------ */

function renderResults(list) {
    const area = document.getElementById("resultArea");
    const count = document.getElementById("resultCount");

    area.innerHTML = "";
    count.textContent = `${list.length} 件`;

    for (const w of list) {
        const div = document.createElement("div");
        div.className = "p-2 rounded bg-slate-800 border border-slate-700";
        div.textContent = w;
        area.appendChild(div);
    }
}

function renderDictionaryManager() {
    const list = document.getElementById("dictList");
    list.innerHTML = "";

    const dict = DICTIONARY_MASTER.country.concat(DICTIONARY_MASTER.capital);

    for (const w of dict) {
        const row = document.createElement("div");
        row.className = "flex items-center gap-2 mb-1";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = true;

        const label = document.createElement("span");
        label.textContent = w;

        row.appendChild(cb);
        row.appendChild(label);
        list.appendChild(row);
    }
}

/* ------------------------------
   4. 初期化
------------------------------ */

function init() {
    // 辞書管理 UI
    renderDictionaryManager();

    // RUN ボタン
    document.getElementById("runEngine").onclick = () => {
        const requiredChars = parseRequiredChars(
            document.getElementById("requiredChars").value
        );

        const options = {
            requiredChars,
            excludeConjugation: document.getElementById("excludeConjugation").checked,
            mergeConjugation: document.getElementById("mergeConjugation").checked,
            lengthMode: document.getElementById("lengthMode").value,
            exactLimit: Number(document.getElementById("exactLimit").value || 0),
            hiraganaToKatakana: document.getElementById("hiraganaToKatakana").checked,
            blueIsRequired: document.getElementById("blueIsRequired").checked,
            backwardLink: document.getElementById("backwardLink").checked,
            gyukou: document.getElementById("gyukou").checked,
            noSingleLoop: document.getElementById("noSingleLoop").checked,
            limit: Number(document.getElementById("limit").value || 0),
            timeout: Number(document.getElementById("timeout").value || 0)
        };

        const result = searchRoutes(options);
        renderResults(result);
    };

    // 辞書 全開放 / 全禁止
    document.getElementById("dictOpenAll").onclick = () => {
        document.querySelectorAll("#dictList input[type=checkbox]").forEach(cb => cb.checked = true);
    };
    document.getElementById("dictCloseAll").onclick = () => {
        document.querySelectorAll("#dictList input[type=checkbox]").forEach(cb => cb.checked = false);
    };
}

window.onload = init;
