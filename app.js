/* ==========================================================
 * アイコン付きセリフメーカー app.js
 * - プリセット管理（localStorage: serifu-maker:presets:v1）
 * - セリフ行の編集（下書き: serifu-maker:draft:v1）
 * - プレビュー描画（プレビュー＝書き出し対象そのもの）
 * - PNG保存／クリップボードコピー／1行ずつ個別保存
 * ========================================================== */

(() => {
  "use strict";

  const LS_PRESETS = "serifu-maker:presets:v1"; // キー名は据え置き。中の version で世代管理する
  const PRESETS_VERSION = 2;
  const LS_DRAFT = "serifu-maker:draft:v1";

  // presets.default.json と同内容のフォールバック（file:// 直開きなど fetch 不可時用）
  const FALLBACK_PRESETS = [
    { id: "preset1", name: "キャラ1", aliases: [], icon: "", bubbleBg: "#FFF0F3", bubbleBorder: "#E8899F", textColor: "#3D3238", nameColor: "#D2607C", defaultSide: "left" },
    { id: "preset2", name: "キャラ2", aliases: [], icon: "", bubbleBg: "#FFF9E0", bubbleBorder: "#F0CE5A", textColor: "#3D3A32", nameColor: "#D9A616", defaultSide: "left" },
    { id: "preset3", name: "キャラ3", aliases: [], icon: "", bubbleBg: "#F2EEFA", bubbleBorder: "#9B87C4", textColor: "#332F3D", nameColor: "#6F58A3", defaultSide: "left" },
    { id: "preset4", name: "キャラ4", aliases: [], icon: "", bubbleBg: "#EEF5F2", bubbleBorder: "#84AFA0", textColor: "#2F3A36", nameColor: "#4F8272", defaultSide: "right" }
  ];

  // 同梱の素材アイコン（アップロードとは別の導線で選べる）
  // 色はキャラのイメージカラー：枠線と名前は濃いめ、吹き出し背景は薄め、文字色は黒固定
  const BUILTIN_ICONS = [
    { id: "kyown",  name: "きょん",  aliases: ["kyown"],           file: "./assets/icon/thumb/kyown_icon.png",  bubbleBg: "#FFF0F3", bubbleBorder: "#E8899F", nameColor: "#D2607C", textColor: "#000000" },
    { id: "mia",    name: "ミア",    aliases: ["みあ", "Mia"],      file: "./assets/icon/thumb/mia_icon.png",    bubbleBg: "#FFF9E0", bubbleBorder: "#E8BE3C", nameColor: "#C79408", textColor: "#000000" },
    { id: "rain",   name: "レイン",  aliases: ["れいん", "Rain"],   file: "./assets/icon/thumb/rain_icon.png",   bubbleBg: "#F2EEFA", bubbleBorder: "#9B87C4", nameColor: "#6F58A3", textColor: "#000000" },
    { id: "shiori", name: "しおり",  aliases: ["シオリ", "Shiori"], file: "./assets/icon/thumb/shiori_icon.png", bubbleBg: "#EAF4FB", bubbleBorder: "#7BAFD4", nameColor: "#3D7EA6", textColor: "#000000" }
  ];

  const FONT_FAMILIES = {
    rounded: '"M PLUS Rounded 1c"',
    sans: '"Noto Sans JP"',
    mincho: '"Shippori Mincho"',
    tegaki: '"Yomogi"'
  };

  const state = {
    presets: [],
    lines: [],
    options: {
      background: "transparent", // "transparent" | "white"
      font: "rounded",           // rounded | sans | mincho | tegaki
      fontSize: 16,              // 14 | 16 | 18
      width: 620,                // 620 | 700 | 800
      everyIcon: false           // 同一キャラ連続時も毎行アイコンを出す
    }
  };

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const canvasEl = $("#canvas");
  const previewWrapper = $("#previewWrapper");
  const lineListEl = $("#lineList");
  const presetListEl = $("#presetList");
  const statusEl = $("#exportStatus");

  // ==========================================================
  // 永続化
  // ==========================================================

  // version 1 → 2：aliases（別名）を追加する。既存データは壊さない
  // localStorageのキー名は :v1 のまま（キーを変えると既存データが読めなくなるため）
  function migrate(data) {
    if (!data) return null;
    if (data.version === 1 || data.version === undefined) {
      data.presets = data.presets.map((p) => ({ ...p, aliases: p.aliases ?? [] }));
      data.version = PRESETS_VERSION;
    }
    // version 2 以降でも aliases が欠けていれば補う（手で編集された場合の保険）
    data.presets = data.presets.map((p) => (Array.isArray(p.aliases) ? p : { ...p, aliases: [] }));
    return data;
  }

  function loadPresets() {
    try {
      const raw = localStorage.getItem(LS_PRESETS);
      if (raw) {
        const data = migrate(JSON.parse(raw));
        if (data && Array.isArray(data.presets) && data.presets.length > 0) {
          return data.presets;
        }
      }
    } catch (e) {
      console.warn("プリセットの読み込みに失敗:", e);
    }
    return null;
  }

  function savePresets() {
    try {
      localStorage.setItem(LS_PRESETS, JSON.stringify({ version: PRESETS_VERSION, presets: state.presets }));
    } catch (e) {
      setStatus("⚠️ プリセットを保存できませんでした（容量オーバーの可能性）。不要なプリセットを削除してみてください");
      console.error(e);
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(LS_DRAFT);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.lines)) {
          state.lines = data.lines;
          if (data.options) Object.assign(state.options, data.options);
          return true;
        }
      }
    } catch (e) {
      console.warn("下書きの読み込みに失敗:", e);
    }
    return false;
  }

  function saveDraft() {
    try {
      localStorage.setItem(LS_DRAFT, JSON.stringify({ lines: state.lines, options: state.options }));
    } catch (e) {
      console.warn("下書きの保存に失敗:", e);
    }
  }

  async function loadDefaultPresets() {
    try {
      const res = await fetch("./presets.default.json", { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        const migrated = migrate(data);
        if (migrated && Array.isArray(migrated.presets) && migrated.presets.length > 0) {
          return migrated.presets;
        }
      }
    } catch (e) {
      // file:// で開いた場合など。フォールバックを使う
    }
    return structuredClone(FALLBACK_PRESETS);
  }

  // ==========================================================
  // ユーティリティ
  // ==========================================================

  function getPreset(id) {
    return state.presets.find((p) => p.id === id) || state.presets[0];
  }

  function newPresetId() {
    return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  }

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ==========================================================
  // 書き出し対象（.canvas）の描画
  // プレビューに表示している要素をそのまま書き出す
  // ==========================================================

  function buildLineElement(line, { continued = false } = {}) {
    const preset = getPreset(line.presetId);
    const lineEl = document.createElement("div");
    lineEl.className = `line line--${line.side === "right" ? "right" : "left"}`;
    if (continued) lineEl.classList.add("line--cont");
    lineEl.style.setProperty("--bubble-bg", preset.bubbleBg);
    lineEl.style.setProperty("--bubble-border", preset.bubbleBorder);
    lineEl.style.setProperty("--text-color", preset.textColor);
    lineEl.style.setProperty("--name-color", preset.nameColor);

    const speaker = document.createElement("div");
    speaker.className = "speaker";
    if (preset.icon) {
      const img = document.createElement("img");
      img.className = "avatar";
      img.src = preset.icon;
      img.alt = "";
      speaker.appendChild(img);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "avatar-fallback";
      fallback.textContent = (preset.name || "？").slice(0, 1);
      speaker.appendChild(fallback);
    }
    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = preset.name || "";
    speaker.appendChild(nameEl);

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = line.text || "";

    lineEl.appendChild(speaker);
    lineEl.appendChild(bubble);
    return lineEl;
  }

  function applyCanvasStyle(el) {
    el.className = `canvas canvas--font-${state.options.font}`;
    el.style.width = state.options.width + "px";
    el.style.fontSize = state.options.fontSize + "px";
  }

  function renderCanvas() {
    applyCanvasStyle(canvasEl);
    canvasEl.textContent = "";
    let prevKey = null;
    for (const line of state.lines) {
      const key = line.presetId + "/" + line.side;
      const continued = !state.options.everyIcon && key === prevKey;
      canvasEl.appendChild(buildLineElement(line, { continued }));
      prevKey = key;
    }
    previewWrapper.classList.toggle("preview-wrapper--checker", state.options.background === "transparent");
    previewWrapper.classList.toggle("preview-wrapper--white", state.options.background === "white");
  }

  // ==========================================================
  // 編集パネル：セリフ行
  // ==========================================================

  function renderLineEditors() {
    lineListEl.textContent = "";
    state.lines.forEach((line, index) => {
      const box = document.createElement("div");
      box.className = "line-editor" + (line.unassigned ? " line-editor--unassigned" : "");

      const row = document.createElement("div");
      row.className = "line-editor__row";

      const select = document.createElement("select");
      select.className = "line-editor__preset";
      select.setAttribute("aria-label", "キャラを選択");
      for (const p of state.presets) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "（名前なし）";
        if (p.id === line.presetId) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        line.presetId = select.value;
        line.side = getPreset(line.presetId).defaultSide === "right" ? "right" : "left";
        delete line.unassigned; // 手で選び直したら未割り当ての印を消す
        update();
      });
      row.appendChild(select);

      const flipBtn = document.createElement("button");
      flipBtn.type = "button";
      flipBtn.className = "btn";
      flipBtn.textContent = "⇄ " + (line.side === "right" ? "右" : "左");
      flipBtn.title = "アイコンの左右を切り替え";
      flipBtn.addEventListener("click", () => {
        line.side = line.side === "right" ? "left" : "right";
        update();
      });
      row.appendChild(flipBtn);
      box.appendChild(row);

      if (line.unassigned) {
        const warn = document.createElement("p");
        warn.className = "line-editor__warn";
        warn.textContent = "⚠️ キャラが未割り当てです（仮に先頭のプリセットを設定しています）";
        box.appendChild(warn);
      }

      const textarea = document.createElement("textarea");
      textarea.value = line.text;
      textarea.placeholder = "セリフを入力（改行もそのまま反映されます）";
      textarea.addEventListener("input", () => {
        line.text = textarea.value;
        renderCanvas();
        saveDraft();
      });
      box.appendChild(textarea);

      const buttons = document.createElement("div");
      buttons.className = "line-editor__buttons";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "btn";
      upBtn.textContent = "↑";
      upBtn.title = "上へ移動";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => {
        [state.lines[index - 1], state.lines[index]] = [state.lines[index], state.lines[index - 1]];
        update();
      });

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "btn";
      downBtn.textContent = "↓";
      downBtn.title = "下へ移動";
      downBtn.disabled = index === state.lines.length - 1;
      downBtn.addEventListener("click", () => {
        [state.lines[index], state.lines[index + 1]] = [state.lines[index + 1], state.lines[index]];
        update();
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--danger";
      delBtn.textContent = "✕ 削除";
      delBtn.addEventListener("click", () => {
        state.lines.splice(index, 1);
        update();
      });

      buttons.appendChild(upBtn);
      buttons.appendChild(downBtn);
      buttons.appendChild(delBtn);
      box.appendChild(buttons);

      lineListEl.appendChild(box);
    });
  }

  function addLine() {
    const last = state.lines[state.lines.length - 1];
    const preset = last ? getPreset(last.presetId) : state.presets[0];
    state.lines.push({
      presetId: preset.id,
      text: "",
      side: preset.defaultSide === "right" ? "right" : "left"
    });
    update();
  }

  // ==========================================================
  // 編集パネル：プリセット管理
  // ==========================================================

  function renderPresetEditors() {
    presetListEl.textContent = "";
    state.presets.forEach((preset, index) => {
      const card = document.createElement("div");
      card.className = "preset-card";

      // 上段：アイコン＋名前
      const head = document.createElement("div");
      head.className = "preset-card__head";

      if (preset.icon) {
        const icon = document.createElement("img");
        icon.className = "preset-card__icon";
        icon.src = preset.icon;
        icon.alt = "";
        head.appendChild(icon);
      } else {
        const fallback = document.createElement("div");
        fallback.className = "preset-card__icon preset-card__icon--fallback";
        fallback.style.background = preset.bubbleBorder;
        fallback.textContent = (preset.name || "？").slice(0, 1);
        head.appendChild(fallback);
      }

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "preset-card__name";
      nameInput.value = preset.name;
      nameInput.placeholder = "キャラ名";
      nameInput.addEventListener("input", () => {
        preset.name = nameInput.value;
        savePresets();
        renderCanvas();
      });
      nameInput.addEventListener("change", () => update());
      head.appendChild(nameInput);
      card.appendChild(head);

      // 別名（カンマ区切り）。台本の取り込みで表記ゆれを吸収するための任意項目
      const aliasLabel = document.createElement("label");
      aliasLabel.className = "preset-card__alias";
      const aliasText = document.createElement("span");
      aliasText.textContent = "別名";
      const aliasInput = document.createElement("input");
      aliasInput.type = "text";
      aliasInput.className = "preset-card__aliasInput";
      aliasInput.value = (preset.aliases || []).join(", ");
      aliasInput.placeholder = "みあ, Mia（カンマ区切り・任意）";
      aliasInput.addEventListener("input", () => {
        preset.aliases = aliasInput.value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        savePresets();
      });
      aliasLabel.appendChild(aliasText);
      aliasLabel.appendChild(aliasInput);
      card.appendChild(aliasLabel);

      // 中段：色4つ
      const grid = document.createElement("div");
      grid.className = "preset-card__grid";
      const colorFields = [
        ["bubbleBg", "吹き出し背景"],
        ["bubbleBorder", "枠線"],
        ["nameColor", "名前の色"],
        ["textColor", "文字色"]
      ];
      for (const [key, label] of colorFields) {
        const wrap = document.createElement("label");
        wrap.className = "preset-card__color";
        const input = document.createElement("input");
        input.type = "color";
        input.value = preset[key];
        input.addEventListener("input", () => {
          preset[key] = input.value;
          savePresets();
          renderCanvas();
        });
        const span = document.createElement("span");
        span.textContent = label;
        wrap.appendChild(input);
        wrap.appendChild(span);
        grid.appendChild(wrap);
      }
      card.appendChild(grid);

      // 下段：アイコンアップロード・初期の側・削除
      const foot = document.createElement("div");
      foot.className = "preset-card__foot";

      const fileLabel = document.createElement("label");
      fileLabel.className = "btn";
      fileLabel.textContent = "アイコンを選択";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.hidden = true;
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          preset.icon = await resizeIcon(file);
          savePresets();
          update();
        } catch (e) {
          setStatus("⚠️ アイコンの読み込みに失敗しました");
          console.error(e);
        }
      });
      fileLabel.appendChild(fileInput);
      foot.appendChild(fileLabel);

      // 素材アイコンから選ぶ（アップロードとは別導線）。押すとカード内にサムネ一覧が開く
      const builtinBtn = document.createElement("button");
      builtinBtn.type = "button";
      builtinBtn.className = "btn";
      builtinBtn.textContent = "素材から選ぶ";
      builtinBtn.setAttribute("aria-expanded", "false");
      builtinBtn.addEventListener("click", () => {
        const open = picker.hidden;
        picker.hidden = !open;
        builtinBtn.setAttribute("aria-expanded", String(open));
      });
      foot.appendChild(builtinBtn);

      if (preset.icon) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "btn";
        clearBtn.textContent = "アイコンを外す";
        clearBtn.addEventListener("click", () => {
          preset.icon = "";
          savePresets();
          update();
        });
        foot.appendChild(clearBtn);
      }

      const sideSelect = document.createElement("select");
      sideSelect.setAttribute("aria-label", "初期のアイコン位置");
      for (const [value, label] of [["left", "初期位置：左"], ["right", "初期位置：右"]]) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        if (preset.defaultSide === value) opt.selected = true;
        sideSelect.appendChild(opt);
      }
      sideSelect.addEventListener("change", () => {
        preset.defaultSide = sideSelect.value;
        savePresets();
      });
      foot.appendChild(sideSelect);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--danger";
      delBtn.textContent = "✕ 削除";
      delBtn.addEventListener("click", () => {
        if (state.presets.length <= 1) {
          setStatus("⚠️ プリセットは最低1つ必要です");
          return;
        }
        if (!confirm(`プリセット「${preset.name || "（名前なし）"}」を削除しますか？`)) return;
        state.presets.splice(index, 1);
        // 削除したプリセットを使っていた行は先頭プリセットに付け替える
        const fallbackId = state.presets[0].id;
        for (const line of state.lines) {
          if (line.presetId === preset.id) line.presetId = fallbackId;
        }
        savePresets();
        update();
      });
      foot.appendChild(delBtn);

      card.appendChild(foot);

      const picker = document.createElement("div");
      picker.className = "icon-picker";
      picker.hidden = true;
      for (const builtin of BUILTIN_ICONS) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "icon-picker__item";
        item.title = `${builtin.name}のアイコンと色を設定`;

        const thumb = document.createElement("img");
        thumb.className = "icon-picker__thumb";
        thumb.src = builtin.file;
        thumb.alt = "";
        thumb.loading = "lazy";

        const label = document.createElement("span");
        label.className = "icon-picker__name";
        label.textContent = builtin.name;

        item.appendChild(thumb);
        item.appendChild(label);
        item.addEventListener("click", async () => {
          try {
            await applyBuiltinIcon(preset, builtin);
            savePresets();
            update();
            setStatus(`✅ 「${builtin.name}」のアイコン・名前・色を設定しました`);
          } catch (e) {
            setStatus("⚠️ 素材アイコンの読み込みに失敗しました");
            console.error(e);
          }
        });
        picker.appendChild(item);
      }
      card.appendChild(picker);

      presetListEl.appendChild(card);
    });
  }

  function addPreset() {
    state.presets.push({
      id: newPresetId(),
      name: "新しいキャラ",
      aliases: [],
      icon: "",
      bubbleBg: "#F5F5F5",
      bubbleBorder: "#BBAEB4",
      textColor: "#3D3238",
      nameColor: "#8A7C82",
      defaultSide: "left"
    });
    savePresets();
    update();
  }

  // 素材アイコンを選んだときの適用処理
  // 画像は dataURL 化してプリセットに保存する（データ構造は§4-1のまま。
  // 書き出し時に外部ファイルを取りに行かないので html-to-image が安定する）
  async function applyBuiltinIcon(preset, builtin) {
    const res = await fetch(builtin.file, { cache: "no-cache" });
    if (!res.ok) throw new Error(`素材アイコンの取得に失敗しました (${res.status})`);
    preset.icon = await resizeIcon(await res.blob());
    preset.name = builtin.name;
    preset.aliases = [...(builtin.aliases || [])];
    preset.bubbleBg = builtin.bubbleBg;
    preset.bubbleBorder = builtin.bubbleBorder;
    preset.nameColor = builtin.nameColor;
    preset.textColor = builtin.textColor;
  }

  // アイコンを 128×128 に中央クロップでリサイズして dataURL 化（仕様§9）
  // File でも Blob でも受け取れる
  function resizeIcon(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const size = 128;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          const crop = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - crop) / 2;
          const sy = (img.naturalHeight - crop) / 2;
          ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  // ==========================================================
  // まとめて貼り付け（台本インポート）
  // ==========================================================

  // 1行を「キャラ名」と「セリフ」に分解する。
  // 行頭の絵文字（複数可）はキャプチャせず読み飛ばして捨てる。
  // 区切りは全角：と半角: の両方。最初の1つだけで分割する。
  const LINE_RE = /^\s*(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*\s*)*([^:：]{1,24}?)\s*[:：]\s*(.+)$/u;

  // 外側が「」で囲まれていれば1組だけ外す（中の「」は残す）
  function stripBrackets(text) {
    const t = text.trim();
    if (t.length >= 2 && t.startsWith("「") && t.endsWith("」")) {
      return t.slice(1, -1);
    }
    return t;
  }

  // 名前でプリセットを探す。名前 → 別名 の順。前後の空白を除き大文字小文字は区別しない
  function findPresetByName(name) {
    const key = (name || "").trim().toLowerCase();
    if (!key) return null;
    const exact = state.presets.find((p) => (p.name || "").trim().toLowerCase() === key);
    if (exact) return exact;
    return state.presets.find((p) =>
      (p.aliases || []).some((a) => String(a).trim().toLowerCase() === key)
    ) || null;
  }

  // 台本テキストを解析して、取り込み候補の配列を返す。
  // マッチしない行は直前のセリフに改行で連結し、空行は読み飛ばす。
  // 鉤括弧は「連結し終わってから」外す。
  function parseScript(text) {
    const items = [];
    for (const raw of String(text).split(/\r?\n/)) {
      if (raw.trim() === "") continue; // 空行は連結もしない
      const m = raw.match(LINE_RE);
      if (m) {
        items.push({ name: m[1].trim(), text: m[2] });
      } else if (items.length > 0) {
        items[items.length - 1].text += "\n" + raw.trim();
      } else {
        // 1行目からマッチしない場合は未割り当ての行として扱う
        items.push({ name: "", text: raw.trim() });
      }
    }
    // 連結が終わってから括弧を外し、プリセットを照合する
    return items.map((it) => {
      const preset = it.name ? findPresetByName(it.name) : null;
      return {
        name: it.name,
        text: stripBrackets(it.text),
        presetId: preset ? preset.id : "",
        matched: !!preset
      };
    });
  }

  // ---------- 取り込みモーダル ----------

  let bulkItems = []; // プレビュー中の候補

  function openBulkModal() {
    $("#bulkModal").hidden = false;
    $("#bulkInput").value = "";
    refreshBulkPreview();
    $("#bulkInput").focus();
    document.addEventListener("keydown", onBulkKeydown);
  }

  function closeBulkModal() {
    $("#bulkModal").hidden = true;
    document.removeEventListener("keydown", onBulkKeydown);
  }

  function onBulkKeydown(e) {
    if (e.key === "Escape") closeBulkModal();
  }

  function refreshBulkPreview() {
    bulkItems = parseScript($("#bulkInput").value);
    const listEl = $("#bulkPreview");
    listEl.textContent = "";
    const unmatched = bulkItems.filter((i) => !i.matched).length;
    $("#bulkCount").textContent =
      `${bulkItems.length}行` + (unmatched > 0 ? `（うち未割り当て ${unmatched}行）` : "");

    bulkItems.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "bulk-row" + (item.matched ? "" : " bulk-row--unmatched");

      const select = document.createElement("select");
      select.className = "bulk-row__select";
      select.setAttribute("aria-label", `${index + 1}行目のキャラ`);
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = item.name ? `（未登録：${item.name}）` : "（キャラを選択）";
      select.appendChild(blank);
      for (const p of state.presets) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || "（名前なし）";
        if (p.id === item.presetId) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        item.presetId = select.value;
        item.matched = !!select.value;
        refreshBulkRowState(row, item);
        const un = bulkItems.filter((i) => !i.matched).length;
        $("#bulkCount").textContent =
          `${bulkItems.length}行` + (un > 0 ? `（うち未割り当て ${un}行）` : "");
      });

      const textEl = document.createElement("div");
      textEl.className = "bulk-row__text";
      textEl.textContent = item.text;

      row.appendChild(select);
      row.appendChild(textEl);
      listEl.appendChild(row);
    });

    if (bulkItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "上のテキストエリアに台本を貼り付けると、ここに取り込む内容が表示されます。";
      listEl.appendChild(empty);
    }
  }

  function refreshBulkRowState(row, item) {
    row.classList.toggle("bulk-row--unmatched", !item.matched);
  }

  function applyBulk() {
    if (bulkItems.length === 0) {
      setStatus("⚠️ 取り込む行がありません");
      return;
    }
    const mode = $("#bulkMode").value;
    if (mode === "replace") {
      if (!confirm(`現在の ${state.lines.length} 行をすべて削除して、${bulkItems.length} 行に置き換えます。よろしいですか？`)) return;
    }
    // 未割り当ては先頭のプリセットを仮に割り当て、行に印を付ける（印は編集パネルのみ・書き出しには出さない）
    const newLines = bulkItems.map((item) => {
      const preset = item.presetId ? getPreset(item.presetId) : state.presets[0];
      return {
        presetId: preset.id,
        text: item.text,
        side: preset.defaultSide === "right" ? "right" : "left",
        unassigned: !item.matched
      };
    });
    state.lines = mode === "replace" ? newLines : state.lines.concat(newLines);
    closeBulkModal();
    update();
    const un = newLines.filter((l) => l.unassigned).length;
    setStatus(`✅ ${newLines.length}行を取り込みました` + (un > 0 ? `（${un}行はキャラ未割り当てです）` : ""));
  }

  // ==========================================================
  // 画像の書き出し（仕様§7）
  // ==========================================================

  async function waitFonts() {
    try {
      await document.fonts.ready; // フォント読み込み待ち（必須）
      const fam = FONT_FAMILIES[state.options.font];
      await Promise.all([
        document.fonts.load(`400 16px ${fam}`),
        document.fonts.load(`700 16px ${fam}`)
      ]);
    } catch (e) {
      console.warn("フォント読み込み待ちに失敗:", e);
    }
  }

  function exportOptions() {
    return {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: state.options.background === "white" ? "#ffffff" : undefined
    };
  }

  // 1回目は捨てて2回目を採用（初回描画崩れ対策・仕様§7-1）
  async function exportPng(node) {
    await waitFonts();
    const opts = exportOptions();
    await htmlToImage.toPng(node, opts);
    return await htmlToImage.toPng(node, opts);
  }

  async function exportBlob(node) {
    await waitFonts();
    const opts = exportOptions();
    await htmlToImage.toBlob(node, opts);
    return await htmlToImage.toBlob(node, opts);
  }

  // 結果画像は blob: URL で表示する。
  // data: URL だと、右クリック→「画像をコピー」でnoteなどのエディタに貼れないため
  let lastResultUrl = null;

  function showResult(blob) {
    if (lastResultUrl) URL.revokeObjectURL(lastResultUrl);
    lastResultUrl = URL.createObjectURL(blob);
    $("#resultArea").hidden = false;
    $("#resultImg").src = lastResultUrl;
  }

  async function showResultFromDataUrl(dataUrl) {
    const res = await fetch(dataUrl);
    showResult(await res.blob());
  }

  async function onSavePng() {
    try {
      setStatus("書き出し中…");
      const dataUrl = await exportPng(canvasEl);
      downloadDataUrl(dataUrl, `serifu_${timestamp()}.png`);
      await showResultFromDataUrl(dataUrl);
      setStatus("✅ PNGを保存しました");
    } catch (e) {
      setStatus("⚠️ 書き出しに失敗しました。ページを再読み込みして試してください");
      console.error(e);
    }
  }

  async function onCopy() {
    try {
      setStatus("コピー中…");
      const blob = await exportBlob(canvasEl);
      if (!blob) throw new Error("blob生成に失敗");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showResult(blob);
      setStatus("✅ クリップボードにコピーしました");
    } catch (e) {
      console.error(e);
      // Safari など非同期を挟むと失敗するブラウザ向けフォールバック（仕様§7-2）
      try {
        const dataUrl = await exportPng(canvasEl);
        await showResultFromDataUrl(dataUrl);
      } catch (e2) {
        console.error(e2);
      }
      setStatus("⚠️ コピーできませんでした。「PNGで保存」でファイルに保存してから、noteの画像追加で選んでください");
    }
  }

  // 1行ずつ個別書き出し（仕様§7-4）：各行を単独レンダリングして連続ダウンロード
  async function onSaveEach() {
    const lines = state.lines.filter((l) => (l.text || "").length > 0);
    if (lines.length === 0) {
      setStatus("⚠️ セリフが入力されていません");
      return;
    }
    setStatus("1行ずつ書き出し中…");
    const holder = document.createElement("div");
    holder.style.position = "absolute";
    holder.style.left = "-99999px";
    holder.style.top = "0";
    document.body.appendChild(holder);
    try {
      const stamp = timestamp();
      for (let i = 0; i < lines.length; i++) {
        const single = document.createElement("div");
        applyCanvasStyle(single);
        single.appendChild(buildLineElement(lines[i])); // 個別出力は常にアイコン付き
        holder.appendChild(single);
        const dataUrl = await exportPng(single);
        downloadDataUrl(dataUrl, `serifu_${stamp}_${String(i + 1).padStart(2, "0")}.png`);
        holder.removeChild(single);
        // 連続ダウンロードがブロックされないよう少し間を空ける
        await new Promise((r) => setTimeout(r, 300));
        setStatus(`1行ずつ書き出し中… (${i + 1}/${lines.length})`);
      }
      setStatus(`✅ ${lines.length} 枚を保存しました`);
    } catch (e) {
      setStatus("⚠️ 書き出しに失敗しました");
      console.error(e);
    } finally {
      holder.remove();
    }
  }

  // ==========================================================
  // オプションUI
  // ==========================================================

  function bindOptions() {
    const bgSelect = $("#bgSelect");
    const fontSelect = $("#fontSelect");
    const fontSizeSelect = $("#fontSizeSelect");
    const widthSelect = $("#widthSelect");
    const everyIconCheck = $("#everyIconCheck");

    bgSelect.value = state.options.background;
    fontSelect.value = state.options.font;
    fontSizeSelect.value = String(state.options.fontSize);
    widthSelect.value = String(state.options.width);
    everyIconCheck.checked = state.options.everyIcon;

    bgSelect.addEventListener("change", () => {
      state.options.background = bgSelect.value;
      renderCanvas();
      saveDraft();
    });
    fontSelect.addEventListener("change", () => {
      state.options.font = fontSelect.value;
      // 切り替え直後の書き出し事故防止に明示的に読み込んでおく（仕様§5-6）
      waitFonts();
      renderCanvas();
      saveDraft();
    });
    fontSizeSelect.addEventListener("change", () => {
      state.options.fontSize = Number(fontSizeSelect.value);
      renderCanvas();
      saveDraft();
    });
    widthSelect.addEventListener("change", () => {
      state.options.width = Number(widthSelect.value);
      renderCanvas();
      saveDraft();
    });
    everyIconCheck.addEventListener("change", () => {
      state.options.everyIcon = everyIconCheck.checked;
      renderCanvas();
      saveDraft();
    });
  }

  // ==========================================================
  // 全体更新・初期化
  // ==========================================================

  function update() {
    renderLineEditors();
    renderPresetEditors();
    renderCanvas();
    saveDraft();
  }

  async function init() {
    state.presets = loadPresets() || (await loadDefaultPresets());
    savePresets();

    if (!loadDraft() || state.lines.length === 0) {
      const p1 = state.presets[0];
      const p2 = state.presets[1] || state.presets[0];
      state.lines = [
        { presetId: p1.id, text: "こんにちは！ここにセリフを入力してね", side: p1.defaultSide === "right" ? "right" : "left" },
        { presetId: p2.id, text: "行を追加すれば\n会話にもできるよ", side: p2.defaultSide === "right" ? "right" : "left" }
      ];
    }
    // 存在しないプリセットを参照している行を補正（インポートや削除後の保険）
    for (const line of state.lines) {
      if (!state.presets.some((p) => p.id === line.presetId)) {
        line.presetId = state.presets[0].id;
      }
    }

    bindOptions();
    $("#addLineBtn").addEventListener("click", addLine);
    $("#bulkPasteBtn").addEventListener("click", openBulkModal);
    $("#bulkInput").addEventListener("input", refreshBulkPreview);
    $("#bulkApply").addEventListener("click", applyBulk);
    for (const el of document.querySelectorAll("#bulkModal [data-close]")) {
      el.addEventListener("click", closeBulkModal);
    }
    $("#addPresetBtn").addEventListener("click", addPreset);
    $("#savePngBtn").addEventListener("click", onSavePng);
    $("#copyBtn").addEventListener("click", onCopy);
    $("#saveEachBtn").addEventListener("click", onSaveEach);

    update();
    waitFonts().then(() => renderCanvas());
  }

  init();
})();
