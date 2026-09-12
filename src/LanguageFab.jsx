import React, { useEffect, useRef, useState } from "react";

export const LANGS = [
  { code: "en",    flag: "🇺🇸", name: "English"    },
  { code: "es",    flag: "🇪🇸", name: "Spanish"    },
  { code: "fr",    flag: "🇫🇷", name: "French"     },
  { code: "pt",    flag: "🇧🇷", name: "Portuguese" },
  { code: "ht",    flag: "🇭🇹", name: "Haitian Creole" },
  { code: "zh-CN", flag: "🇨🇳", name: "Chinese"    },
  { code: "ar",    flag: "🇸🇦", name: "Arabic"     },
  { code: "hi",    flag: "🇮🇳", name: "Hindi"      },
  { code: "de",    flag: "🇩🇪", name: "German"     },
  { code: "it",    flag: "🇮🇹", name: "Italian"    },
  { code: "ja",    flag: "🇯🇵", name: "Japanese"   },
  { code: "ko",    flag: "🇰🇷", name: "Korean"     },
  { code: "ru",    flag: "🇷🇺", name: "Russian"    },
  { code: "pl",    flag: "🇵🇱", name: "Polish"     },
  { code: "vi",    flag: "🇻🇳", name: "Vietnamese" },
  { code: "tl",    flag: "🇵🇭", name: "Filipino"   },
  { code: "uk",    flag: "🇺🇦", name: "Ukrainian"  },
  { code: "nl",    flag: "🇳🇱", name: "Dutch"      },
  { code: "tr",    flag: "🇹🇷", name: "Turkish"    },
  { code: "th",    flag: "🇹🇭", name: "Thai"       },
];

const LANG_KEY = "sdx_lang";

export function getSavedLang() {
  try { return localStorage.getItem(LANG_KEY) || "en"; } catch { return "en"; }
}

function setCookie(name, value, remove) {
  const exp = remove ? "Thu, 01 Jan 1970 00:00:00 GMT" : new Date(Date.now() + 365 * 864e5).toUTCString();
  const host = location.hostname;
  document.cookie = `${name}=${value}; expires=${exp}; path=/`;
  if (host && host.includes(".")) {
    document.cookie = `${name}=${value}; expires=${exp}; path=/; domain=${host}`;
    document.cookie = `${name}=${value}; expires=${exp}; path=/; domain=.${host}`;
  }
}

function applyViaSelect(code, remaining) {
  const sel = document.querySelector("#google_translate_element select");
  if (sel) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(sel, code); else sel.value = code;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    setTimeout(() => { if (sel.value !== code && remaining > 0) applyViaSelect(code, remaining - 1); }, 250);
  } else if (remaining > 0) {
    setTimeout(() => applyViaSelect(code, remaining - 1), 250);
  }
}

/** Apply a language to the whole page through the Google Translate widget. */
export function applyLanguage(code) {
  try {
    if (code === "en") {
      localStorage.removeItem(LANG_KEY);
      setCookie("googtrans", "", true);
    } else {
      localStorage.setItem(LANG_KEY, code);
      setCookie("googtrans", `/en/${code}`);
    }
  } catch {}
  if (typeof window.doGTranslate === "function") {
    window.doGTranslate(`en|${code}`);
    return;
  }
  applyViaSelect(code, code === "en" ? 10 : 32);
}

/**
 * Floating language switch, mounted once next to <App/> so it exists on
 * every screen (badge lock, inspector, history, admin, crew boards, portal).
 * Re-applies the remembered language on load. Opens on the "sdx-open-lang"
 * window event too, so in-page buttons can trigger it.
 */
export default function LanguageFab() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(getSavedLang);
  const [q, setQ] = useState("");
  const popRef = useRef(null);
  const btnRef = useRef(null);

  // Restore the saved language after the Google widget loads.
  useEffect(() => {
    const saved = getSavedLang();
    if (saved !== "en") {
      const t = setTimeout(() => applyLanguage(saved), 400);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const onOpen = () => { setOpen(true); setQ(""); };
    window.addEventListener("sdx-open-lang", onOpen);
    return () => window.removeEventListener("sdx-open-lang", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function outside(e) {
      if (popRef.current && !popRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false); setQ("");
      }
    }
    function esc(e) { if (e.key === "Escape") { setOpen(false); setQ(""); } }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", esc); };
  }, [open]);

  const current = LANGS.find(l => l.code === lang) || LANGS[0];
  const needle = q.trim().toLowerCase();
  const filtered = needle ? LANGS.filter(l => l.name.toLowerCase().includes(needle) || l.code.includes(needle)) : LANGS;

  function pick(code) {
    setLang(code);
    setOpen(false);
    setQ("");
    applyLanguage(code);
  }

  return (
    <div className="langFabWrap notranslate" translate="no">
      <button
        ref={btnRef}
        type="button"
        className={`langFab${open ? " langFabActive" : ""}${lang !== "en" ? " langFabSet" : ""}`}
        title="Change language"
        aria-label="Change language"
        aria-expanded={open}
        onClick={() => { setOpen(v => !v); setQ(""); }}
      >
        <span className="langFabFlag">{lang === "en" ? "🌐" : current.flag}</span>
        <span className="langFabCode">{lang === "en" ? "Language" : current.name}</span>
      </button>
      {open && (
        <div ref={popRef} className="translatePopover langPop" onClick={e => e.stopPropagation()}>
          <div className="translatePopoverHeader">
            <span className="translatePopoverIcon">🌐</span>
            <div>
              <div className="translatePopoverTitle">Language</div>
              <div className="translatePopoverSub">
                {lang === "en" ? "Choose a language for the whole app" : `Active: ${current.name} — remembered on this device`}
              </div>
            </div>
          </div>
          <div className="translatePopoverDivider" />
          <div className="translateSearchWrap">
            <input
              className="translateSearchInput"
              type="text"
              placeholder="Search language…"
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <div className="translateLangGrid">
            {filtered.map(l => (
              <button
                key={l.code}
                type="button"
                className={`translateLangBtn${lang === l.code ? " translateLangActive" : ""}`}
                onClick={() => pick(l.code)}
              >
                <span className="translateLangFlag">{l.flag}</span>
                <span className="translateLangName">{l.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="translateNoResults">No languages found</div>}
          </div>
          <div className="translatePopoverFooter">
            <span className="translatePoweredLogo">G</span>
            Powered by Google Translate
          </div>
        </div>
      )}
    </div>
  );
}
