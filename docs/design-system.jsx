import { useState, useCallback, useRef, useEffect } from "react";

/* ══════════════════════════════════════════════════════════════
   POKESNIPE — Living Design Token Reference
   
   This page IS the design system. Every colour, font, radius,
   and motion pattern is rendered live using the actual tokens.
   Click any value to copy it to your clipboard.
   ══════════════════════════════════════════════════════════════ */

// ─── Token Data ──────────────────────────────────────
const BACKGROUNDS = [
  { token: "--bg0", hex: "#06080f", usage: "App shell, deepest background" },
  { token: "--bg1", hex: "#0a0e1a", usage: "Rail, queue panel, secondary surfaces" },
  { token: "--bg2", hex: "#111827", usage: "Cards, inputs, elevated panels" },
  { token: "--bg3", hex: "#1a2236", usage: "Hover states on bg2 elements" },
];

const SURFACES = [
  { token: "--s1", hex: "#1e2940", usage: "Card borders, inset tracks" },
  { token: "--s2", hex: "#243150", usage: "Dividers, secondary borders" },
  { token: "--s3", hex: "#2d3b5e", usage: "Scrollbar thumbs, active borders" },
];

const BORDERS = [
  { token: "--b1", value: "rgba(96,165,250,.06)", usage: "Default dividers, subtle separators" },
  { token: "--b2", value: "rgba(96,165,250,.12)", usage: "Button borders, input outlines" },
  { token: "--b3", value: "rgba(96,165,250,.22)", usage: "Hover/focus ring, active borders" },
];

const TEXT = [
  { token: "--t1", hex: "#f0f4fc", usage: "Primary text, headings, card names" },
  { token: "--t2", hex: "#94a3c4", usage: "Secondary text, data values" },
  { token: "--t3", hex: "#5b6d8e", usage: "Tertiary text, metadata" },
  { token: "--t4", hex: "#3a4a6b", usage: "Disabled, timestamps, hints" },
];

const ACCENTS = [
  { name: "Emerald", token: "--emerald", hex: "#34d399", soft: "rgba(52,211,153,.10)", usage: "Profit, positive, success, NM condition" },
  { name: "Amber", token: "--amber", hex: "#fbbf24", soft: "rgba(251,191,36,.10)", usage: "Warning, fair trust, LP condition" },
  { name: "Coral", token: "--coral", hex: "#f87171", soft: "rgba(248,113,113,.10)", usage: "Danger, risky trust, negative trend" },
  { name: "Blue", token: "--blue", hex: "#60a5fa", soft: "rgba(96,165,250,.10)", usage: "Interactive, active nav, CTA" },
];

const TIERS = [
  { name: "GRAIL", c: "#c4b5fd", bg: "rgba(196,181,253,0.10)", b: "rgba(196,181,253,0.25)" },
  { name: "HIT", c: "#60a5fa", bg: "rgba(96,165,250,0.10)", b: "rgba(96,165,250,0.25)" },
  { name: "FLIP", c: "#f472b6", bg: "rgba(244,114,182,0.10)", b: "rgba(244,114,182,0.25)" },
];

const RARITIES = [
  { name: "Common", color: "#5b6d8e", ref: "var(--t3)" },
  { name: "Uncommon", color: "#60a5fa", ref: "var(--blue)" },
  { name: "Rare", color: "#fbbf24", ref: "var(--amber)" },
  { name: "Double Rare", color: "#34d399", ref: "var(--emerald)" },
  { name: "Ultra Rare", color: "#c084fc", ref: "#c084fc" },
];

const TYPE_SCALE = [
  { size: 32, weight: 700, font: "mono", usage: "Hero profit value" },
  { size: 30, weight: 700, font: "sans", usage: "Card detail name" },
  { size: 24, weight: 700, font: "sans", usage: "Page titles, hero card name" },
  { size: 22, weight: 700, font: "sans", usage: "Expansion banner name" },
  { size: 18, weight: 700, font: "mono", usage: "Trust ring value" },
  { size: 16, weight: 600, font: "mono", usage: "Attack damage, trend changes" },
  { size: 15, weight: 700, font: "sans", usage: "Expansion card name" },
  { size: 14, weight: 600, font: "both", usage: "Stat values, buy/sell prices" },
  { size: 13, weight: 600, font: "both", usage: "Buttons, section titles" },
  { size: 12, weight: 500, font: "both", usage: "Queue names, pricing rows" },
  { size: 11, weight: 500, font: "mono", usage: "Match labels, tag text" },
  { size: 10, weight: 400, font: "mono", usage: "Set names, dates, stat labels" },
  { size: 9, weight: 500, font: "mono", usage: "Section headings (uppercase)" },
];

const RADII = [
  { token: "--r-s", value: "8px", usage: "Buttons, inputs, tags, small cards" },
  { token: "--r-m", value: "12px", usage: "Queue cards, action buttons, trend cards" },
  { token: "--r-l", value: "18px", usage: "Hero card frame, expansion cards" },
  { token: "pill", value: "99px", usage: "Tier badges, condition badges, chips" },
  { token: "circle", value: "50%", usage: "Trust ring, live dot, alert badge" },
];

const MOTIONS = [
  { name: "View fade-in", value: "0.3s ease", css: "animation: fin 0.3s ease", demo: "fade" },
  { name: "Hero entrance", value: "0.4s cubic-bezier(.16,1,.3,1)", css: "animation: hero 0.4s cubic-bezier(.16,1,.3,1)", demo: "hero" },
  { name: "Card stagger", value: "0.35s + index × 40ms", css: "animation-delay: calc(var(--i) * 40ms)", demo: "stagger" },
  { name: "Hover lift", value: "0.2s ease", css: "transition: transform 0.2s, box-shadow 0.2s", demo: "lift" },
  { name: "Live pulse", value: "2s ease-in-out infinite", css: "animation: pulse 2s ease-in-out infinite", demo: "pulse" },
  { name: "Bar fill", value: "0.6s ease", css: "transition: width 0.6s ease", demo: "fill" },
];

const SPACING = [
  { context: "Page padding", value: "28px", note: "Catalog pages, card detail" },
  { context: "Section padding", value: "24px", note: "Hero scroll, headers" },
  { context: "Card internal", value: "16px", note: "Expansion card body, intel groups" },
  { context: "Component gap", value: "10–12px", note: "Grid gaps, toolbar gaps" },
  { context: "Inline gap", value: "4–8px", note: "Tag gaps, icon-to-text" },
  { context: "Rail width", value: "56px", note: "Fixed — never changes" },
  { context: "Queue width", value: "320px", note: "Fixed — dashboard only" },
];

const EXPANSIONS = [
  { name: "Ascended Heroes", c1: "#f59e0b", c2: "#b45309" },
  { name: "Phantasmal Flames", c1: "#a78bfa", c2: "#6d28d9" },
  { name: "Mega Evolution", c1: "#3b82f6", c2: "#1d4ed8" },
  { name: "Destined Rivals", c1: "#ec4899", c2: "#9d174d" },
  { name: "Prismatic Evolutions", c1: "#c084fc", c2: "#7c3aed" },
  { name: "Surging Sparks", c1: "#f59e0b", c2: "#ea580c" },
  { name: "Temporal Forces", c1: "#06b6d4", c2: "#0e7490" },
  { name: "Shrouded Fable", c1: "#6b21a8", c2: "#3b0764" },
];

// ─── Components ──────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }, [text]);

  return (
    <button className="copy-btn" onClick={copy} title={`Copy: ${text}`}>
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9l4.5-6" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>
      )}
    </button>
  );
}

function Swatch({ hex, size = 40 }) {
  return <div className="swatch" style={{ background: hex, width: size, height: size }} />;
}

function TokenRow({ token, value, usage, hex, children }) {
  return (
    <div className="token-row">
      <div className="token-row__main">
        {hex && <Swatch hex={hex} />}
        {children}
        <div className="token-row__text">
          <div className="token-row__name">
            <code>{token}</code>
            <CopyButton text={value || hex || token} />
          </div>
          {(value || hex) && <span className="token-row__value">{value || hex}</span>}
        </div>
      </div>
      {usage && <span className="token-row__usage">{usage}</span>}
    </div>
  );
}

function Section({ id, title, subtitle, children }) {
  return (
    <section className="ds-section" id={id}>
      <div className="ds-section__header">
        <h2 className="ds-section__title">{title}</h2>
        {subtitle && <p className="ds-section__subtitle">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="ds-sub">
      <h3 className="ds-sub__title">{title}</h3>
      {children}
    </div>
  );
}

function MotionDemo({ type }) {
  const [playing, setPlaying] = useState(false);
  const [key, setKey] = useState(0);

  const play = () => {
    setPlaying(true);
    setKey(k => k + 1);
    if (type !== "pulse") setTimeout(() => setPlaying(false), 1200);
  };
  const stop = () => setPlaying(false);

  return (
    <div className="motion-demo">
      <button className="motion-demo__trigger" onClick={playing && type === "pulse" ? stop : play}>
        {playing && type === "pulse" ? "Stop" : "Play"}
      </button>
      <div className="motion-demo__stage">
        {type === "fade" && <div key={key} className={`md-box ${playing ? "md-fade" : ""}`} />}
        {type === "hero" && <div key={key} className={`md-box ${playing ? "md-hero" : ""}`} />}
        {type === "stagger" && (
          <div className="md-stagger-row">
            {[0,1,2,3].map(i => <div key={`${key}-${i}`} className={`md-box md-box--sm ${playing ? "md-stagger" : ""}`} style={{ "--i": i }} />)}
          </div>
        )}
        {type === "lift" && <div className="md-box md-lift" />}
        {type === "pulse" && <div className={`md-dot ${playing ? "md-pulse" : ""}`} />}
        {type === "fill" && <div className="md-track"><div key={key} className={`md-fill ${playing ? "md-fill--go" : ""}`} /></div>}
      </div>
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────
const NAV = [
  { id: "colours", label: "Colours" },
  { id: "typography", label: "Typography" },
  { id: "spacing", label: "Spacing & Radii" },
  { id: "motion", label: "Motion" },
  { id: "patterns", label: "Patterns" },
  { id: "theming", label: "Expansion Theming" },
];

// ─── Main App ────────────────────────────────────────
export default function DesignTokens() {
  const [activeSection, setActiveSection] = useState("colours");

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", root: document.querySelector(".ds-main") }
    );
    NAV.forEach(n => {
      const el = document.getElementById(n.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ds-shell">
      <style>{STYLES}</style>

      {/* Sidebar nav */}
      <nav className="ds-nav">
        <div className="ds-nav__brand">
          <div className="ds-nav__logo">P</div>
          <div>
            <span className="ds-nav__title">PokeSnipe</span>
            <span className="ds-nav__version">Design Tokens v4</span>
          </div>
        </div>
        <div className="ds-nav__links">
          {NAV.map(n => (
            <a key={n.id} href={`#${n.id}`} className={`ds-nav__link ${activeSection === n.id ? "is-active" : ""}`}
              onClick={e => { e.preventDefault(); document.getElementById(n.id)?.scrollIntoView({ behavior: "smooth" }); }}>
              {n.label}
            </a>
          ))}
        </div>
        <div className="ds-nav__footer">
          <span>Feb 2026 · Internal</span>
          <span>Extracted from v4.jsx</span>
        </div>
      </nav>

      {/* Main content */}
      <main className="ds-main">

        {/* ═══ COLOURS ═══ */}
        <Section id="colours" title="Colour System" subtitle="Every colour in PokeSnipe. Click any value to copy.">

          <SubSection title="Backgrounds">
            <div className="colour-grid colour-grid--wide">
              {BACKGROUNDS.map(b => (
                <div key={b.token} className="colour-card">
                  <div className="colour-card__swatch" style={{ background: b.hex }} />
                  <div className="colour-card__info">
                    <code className="colour-card__token">{b.token}</code>
                    <div className="colour-card__hex-row"><span>{b.hex}</span><CopyButton text={b.hex} /></div>
                    <span className="colour-card__usage">{b.usage}</span>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Surface Borders">
            <div className="colour-grid">
              {SURFACES.map(s => (
                <div key={s.token} className="colour-card">
                  <div className="colour-card__swatch" style={{ background: s.hex }} />
                  <div className="colour-card__info">
                    <code className="colour-card__token">{s.token}</code>
                    <div className="colour-card__hex-row"><span>{s.hex}</span><CopyButton text={s.hex} /></div>
                    <span className="colour-card__usage">{s.usage}</span>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Border Layers (Blue-tinted)">
            <div className="token-list">
              {BORDERS.map(b => (
                <div key={b.token} className="token-row">
                  <div className="token-row__main">
                    <div className="border-demo" style={{ borderColor: b.value }} />
                    <div className="token-row__text">
                      <div className="token-row__name"><code>{b.token}</code><CopyButton text={b.value} /></div>
                      <span className="token-row__value">{b.value}</span>
                    </div>
                  </div>
                  <span className="token-row__usage">{b.usage}</span>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Text Colours">
            <div className="text-preview-grid">
              {TEXT.map(t => (
                <div key={t.token} className="text-preview">
                  <span className="text-preview__sample" style={{ color: t.hex }}>Aa</span>
                  <div className="text-preview__info">
                    <div className="text-preview__token-row"><code>{t.token}</code><CopyButton text={t.hex} /></div>
                    <span className="text-preview__hex">{t.hex}</span>
                    <span className="text-preview__usage">{t.usage}</span>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Semantic Accents">
            <div className="accent-grid">
              {ACCENTS.map(a => (
                <div key={a.name} className="accent-card" style={{ "--ac": a.hex }}>
                  <div className="accent-card__top">
                    <div className="accent-card__solid" style={{ background: a.hex }} />
                    <div className="accent-card__soft" style={{ background: a.soft }} />
                  </div>
                  <div className="accent-card__info">
                    <span className="accent-card__name" style={{ color: a.hex }}>{a.name}</span>
                    <div className="accent-card__vals">
                      <div className="accent-card__val"><code>{a.token}</code><span>{a.hex}</span><CopyButton text={a.hex} /></div>
                      <div className="accent-card__val"><code>{a.token}-soft</code><span>{a.soft}</span><CopyButton text={a.soft} /></div>
                    </div>
                    <span className="accent-card__usage">{a.usage}</span>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Tier Colours">
            <div className="tier-row">
              {TIERS.map(t => (
                <div key={t.name} className="tier-chip" style={{ color: t.c, background: t.bg, borderColor: t.b }}>
                  <span className="tier-chip__name">{t.name}</span>
                  <div className="tier-chip__vals">
                    <span>{t.c}</span><CopyButton text={t.c} />
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Rarity Colours">
            <div className="rarity-row">
              {RARITIES.map(r => (
                <div key={r.name} className="rarity-tag" style={{ color: r.color, borderColor: r.color + "40" }}>
                  <span className="rarity-tag__dot" style={{ background: r.color }} />
                  {r.name}
                  <CopyButton text={r.ref} />
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ═══ TYPOGRAPHY ═══ */}
        <Section id="typography" title="Typography" subtitle="Two fonts, used decisively. No third font.">

          <SubSection title="Font Stacks">
            <div className="font-cards">
              <div className="font-card">
                <span className="font-card__sample font-card__sample--sans">Instrument Sans</span>
                <code className="font-card__token">--font</code>
                <span className="font-card__stack">'Instrument Sans', system-ui, sans-serif</span>
                <span className="font-card__usage">Headings, labels, body text, buttons</span>
                <CopyButton text="font-family: var(--font);" />
              </div>
              <div className="font-card">
                <span className="font-card__sample font-card__sample--mono">JetBrains Mono</span>
                <code className="font-card__token">--mono</code>
                <span className="font-card__stack">'JetBrains Mono', monospace</span>
                <span className="font-card__usage">Prices, data, codes, timestamps</span>
                <CopyButton text="font-family: var(--mono);" />
              </div>
            </div>
          </SubSection>

          <SubSection title="Type Scale">
            <div className="type-scale">
              {TYPE_SCALE.map(t => (
                <div key={`${t.size}-${t.font}`} className="type-row">
                  <span className="type-row__sample" style={{
                    fontSize: Math.min(t.size, 28),
                    fontWeight: t.weight,
                    fontFamily: t.font === "mono" ? "'JetBrains Mono', monospace" : "'Instrument Sans', system-ui, sans-serif",
                  }}>
                    {t.font === "mono" ? "+£462.71" : "Magikarp"}
                  </span>
                  <div className="type-row__meta">
                    <code>{t.size}px / {t.weight}</code>
                    <span className="type-row__font-tag">{t.font}</span>
                  </div>
                  <span className="type-row__usage">{t.usage}</span>
                  <CopyButton text={`font: ${t.weight} ${t.size}px var(--${t.font === "mono" ? "mono" : "font"});`} />
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Weight Roles">
            <div className="weight-demo">
              {[
                { w: 300, role: "Light", note: "Mono only — arrows, decorative" },
                { w: 400, role: "Regular", note: "Body text, descriptions, metadata" },
                { w: 500, role: "Medium", note: "Section headings, filter labels" },
                { w: 600, role: "Semi-Bold", note: "Buttons, stat values, table data" },
                { w: 700, role: "Bold", note: "Titles, profit values, names" },
              ].map(w => (
                <div key={w.w} className="weight-row">
                  <span className="weight-row__sample" style={{ fontWeight: w.w }}>{w.w}</span>
                  <span className="weight-row__role">{w.role}</span>
                  <span className="weight-row__note">{w.note}</span>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ═══ SPACING & RADII ═══ */}
        <Section id="spacing" title="Spacing & Radii" subtitle="Systematic shape language and spatial conventions.">

          <SubSection title="Border Radius Tokens">
            <div className="radii-grid">
              {RADII.map(r => (
                <div key={r.token} className="radius-card">
                  <div className="radius-card__preview" style={{ borderRadius: r.value }} />
                  <div className="radius-card__info">
                    <div className="radius-card__token-row"><code>{r.token}</code><CopyButton text={`border-radius: ${r.value === "50%" || r.value === "99px" ? r.value : `var(${r.token})`};`} /></div>
                    <span className="radius-card__value">{r.value}</span>
                    <span className="radius-card__usage">{r.usage}</span>
                  </div>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Spacing Conventions">
            <div className="spacing-list">
              {SPACING.map(s => (
                <div key={s.context} className="spacing-row">
                  <span className="spacing-row__context">{s.context}</span>
                  <div className="spacing-row__bar-wrap">
                    <div className="spacing-row__bar" style={{ width: `${parseInt(s.value) || 10}px` }} />
                  </div>
                  <code className="spacing-row__value">{s.value}</code>
                  <span className="spacing-row__note">{s.note}</span>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Layout Modes">
            <div className="layout-demos">
              <div className="layout-demo">
                <span className="layout-demo__label">Dashboard</span>
                <div className="layout-demo__grid layout-demo__grid--dash">
                  <div className="ld-zone ld-zone--rail">56px</div>
                  <div className="ld-zone ld-zone--center">1fr</div>
                  <div className="ld-zone ld-zone--queue">320px</div>
                </div>
                <code>grid-template-columns: 56px 1fr 320px</code>
              </div>
              <div className="layout-demo">
                <span className="layout-demo__label">Catalog</span>
                <div className="layout-demo__grid layout-demo__grid--cat">
                  <div className="ld-zone ld-zone--rail">56px</div>
                  <div className="ld-zone ld-zone--center">1fr</div>
                </div>
                <code>grid-template-columns: 56px 1fr</code>
              </div>
            </div>
          </SubSection>
        </Section>

        {/* ═══ MOTION ═══ */}
        <Section id="motion" title="Motion" subtitle="Every animation signals a state change. No decorative motion.">
          <div className="motion-list">
            {MOTIONS.map(m => (
              <div key={m.name} className="motion-card">
                <div className="motion-card__info">
                  <span className="motion-card__name">{m.name}</span>
                  <code className="motion-card__css">{m.css}</code>
                  <CopyButton text={m.css} />
                </div>
                <MotionDemo type={m.demo} />
              </div>
            ))}
          </div>
        </Section>

        {/* ═══ PATTERNS ═══ */}
        <Section id="patterns" title="Component Patterns" subtitle="Reusable thresholds and conventions for any new feature.">

          <SubSection title="Trust Ring Thresholds">
            <div className="threshold-grid">
              {[
                { range: "≥ 93%", label: "Strong", color: "#34d399", desc: "High confidence. Safe to snag." },
                { range: "80–92%", label: "Fair", color: "#fbbf24", desc: "Moderate confidence. Verify first." },
                { range: "< 80%", label: "Risky", color: "#f87171", desc: "Low confidence. Likely skip." },
              ].map(t => (
                <div key={t.label} className="threshold-card">
                  <div className="threshold-card__ring" style={{ borderColor: t.color }}>
                    <span style={{ color: t.color }}>{t.range.replace("≥ ", "").replace("< ", "")}</span>
                  </div>
                  <span className="threshold-card__label" style={{ color: t.color }}>{t.label}</span>
                  <span className="threshold-card__desc">{t.desc}</span>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Metric Bar Pattern">
            <div className="metric-demo">
              {[
                { v: 85, label: "Supply" },
                { v: 55, label: "Velocity" },
                { v: 25, label: "Trend" },
              ].map(m => (
                <div key={m.label} className="metric-row">
                  <span className="metric-row__label">{m.label}</span>
                  <div className="metric-row__track">
                    <div className="metric-row__fill" style={{
                      width: `${m.v}%`,
                      background: m.v >= 70 ? "#34d399" : m.v >= 40 ? "#fbbf24" : "#f87171"
                    }} />
                  </div>
                  <span className="metric-row__val" style={{
                    color: m.v >= 70 ? "#34d399" : m.v >= 40 ? "#fbbf24" : "#f87171"
                  }}>{m.v}%</span>
                </div>
              ))}
              <div className="metric-legend">
                <span><span className="ml-dot" style={{ background: "#34d399" }} /> ≥ 70%</span>
                <span><span className="ml-dot" style={{ background: "#fbbf24" }} /> 40–69%</span>
                <span><span className="ml-dot" style={{ background: "#f87171" }} /> &lt; 40%</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="Condition Badges">
            <div className="badge-demo">
              {[
                { label: "NM", color: "#34d399", bg: "rgba(52,211,153,.10)", b: "rgba(52,211,153,.25)" },
                { label: "LP", color: "#fbbf24", bg: "rgba(251,191,36,.10)", b: "rgba(251,191,36,.25)" },
                { label: "HP", color: "#f87171", bg: "rgba(248,113,113,.10)", b: "rgba(248,113,113,.25)" },
              ].map(c => (
                <span key={c.label} className="cond-badge" style={{ color: c.color, background: c.bg, borderColor: c.b }}>{c.label}</span>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ═══ EXPANSION THEMING ═══ */}
        <Section id="theming" title="Expansion Theming" subtitle="Each expansion gets its own colour pair (c1, c2) via CSS custom properties. Zero CSS changes needed for new expansions.">
          <SubSection title="The Pattern">
            <div className="code-block">
              <code>{'style={{ \'--ec1\': exp.c1, \'--ec2\': exp.c2 }}'}</code>
              <CopyButton text="style={{ '--ec1': exp.c1, '--ec2': exp.c2 }}" />
            </div>
            <div className="code-block">
              <code>{'background: color-mix(in srgb, var(--ec1) 15%, transparent);'}</code>
              <CopyButton text="background: color-mix(in srgb, var(--ec1) 15%, transparent);" />
            </div>
          </SubSection>

          <SubSection title="Live Expansion Themes">
            <div className="expansion-demo-grid">
              {EXPANSIONS.map(e => (
                <div key={e.name} className="exp-demo-card" style={{ "--ec1": e.c1, "--ec2": e.c2 }}>
                  <div className="exp-demo-card__glow" />
                  <span className="exp-demo-card__name">{e.name}</span>
                  <div className="exp-demo-card__swatches">
                    <div className="exp-demo-card__sw" style={{ background: e.c1 }} />
                    <div className="exp-demo-card__sw" style={{ background: e.c2 }} />
                  </div>
                  <div className="exp-demo-card__vals">
                    <code>{e.c1}</code><CopyButton text={e.c1} />
                    <code>{e.c2}</code><CopyButton text={e.c2} />
                  </div>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

      </main>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');

:root {
  --bg0:#06080f; --bg1:#0a0e1a; --bg2:#111827; --bg3:#1a2236;
  --s1:#1e2940; --s2:#243150; --s3:#2d3b5e;
  --b1:rgba(96,165,250,.06); --b2:rgba(96,165,250,.12); --b3:rgba(96,165,250,.22);
  --t1:#f0f4fc; --t2:#94a3c4; --t3:#5b6d8e; --t4:#3a4a6b;
  --emerald:#34d399; --amber:#fbbf24; --coral:#f87171; --blue:#60a5fa;
  --font:'Instrument Sans',system-ui,sans-serif;
  --mono:'JetBrains Mono',monospace;
  --r-s:8px; --r-m:12px; --r-l:18px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body,#root{background:var(--bg0);color:var(--t1);font-family:var(--font);-webkit-font-smoothing:antialiased;overflow:hidden}

/* Shell */
.ds-shell{display:grid;grid-template-columns:240px 1fr;height:100vh;background:var(--bg0)}

/* Nav */
.ds-nav{display:flex;flex-direction:column;padding:24px 20px;background:var(--bg1);border-right:1px solid var(--b1);overflow:hidden}
.ds-nav__brand{display:flex;align-items:center;gap:10px;margin-bottom:28px}
.ds-nav__logo{width:32px;height:32px;border-radius:var(--r-s);background:linear-gradient(135deg,var(--blue),#818cf8);display:flex;align-items:center;justify-content:center;font:700 14px var(--font);color:#fff;flex-shrink:0}
.ds-nav__title{display:block;font:700 14px var(--font);color:var(--t1);letter-spacing:-.02em}
.ds-nav__version{display:block;font:400 10px var(--mono);color:var(--t4)}
.ds-nav__links{display:flex;flex-direction:column;gap:2px;flex:1}
.ds-nav__link{padding:8px 12px;border-radius:var(--r-s);font:500 13px var(--font);color:var(--t3);text-decoration:none;transition:.15s;border:1px solid transparent}
.ds-nav__link:hover{color:var(--t2);background:rgba(96,165,250,.03)}
.ds-nav__link.is-active{color:var(--blue);background:rgba(96,165,250,.06);border-color:rgba(96,165,250,.1)}
.ds-nav__footer{margin-top:auto;display:flex;flex-direction:column;gap:2px;font:400 9px var(--mono);color:var(--t4)}

/* Main */
.ds-main{overflow-y:auto;padding:32px 40px 80px;scroll-behavior:smooth}
.ds-main::-webkit-scrollbar{width:5px}.ds-main::-webkit-scrollbar-thumb{background:var(--s3);border-radius:3px}

/* Section */
.ds-section{margin-bottom:56px}
.ds-section__header{margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--b1)}
.ds-section__title{font:700 22px var(--font);letter-spacing:-.03em;color:var(--t1)}
.ds-section__subtitle{font:400 13px var(--font);color:var(--t3);margin-top:4px}
.ds-sub{margin-bottom:28px}
.ds-sub__title{font:600 11px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px}

/* Copy button */
.copy-btn{width:24px;height:24px;border:1px solid var(--b2);border-radius:var(--r-s);background:none;color:var(--t4);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0}
.copy-btn:hover{border-color:var(--blue);color:var(--blue);background:rgba(96,165,250,.06)}

/* Colour cards */
.colour-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.colour-grid--wide{grid-template-columns:repeat(4,1fr)}
.colour-card{background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);overflow:hidden;transition:.2s}
.colour-card:hover{border-color:var(--b3)}
.colour-card__swatch{height:64px}
.colour-card__info{padding:10px 12px;display:flex;flex-direction:column;gap:3px}
.colour-card__token{font:500 11px var(--mono);color:var(--t2)}
.colour-card__hex-row{display:flex;align-items:center;gap:6px;font:400 10px var(--mono);color:var(--t3)}
.colour-card__usage{font:400 10px var(--font);color:var(--t4);line-height:1.3}

/* Border demos */
.border-demo{width:40px;height:40px;border-radius:var(--r-s);border:2px solid;background:var(--bg2);flex-shrink:0}

/* Token rows */
.token-list{display:flex;flex-direction:column;gap:6px}
.token-row{display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-s);flex-wrap:wrap}
.token-row__main{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.token-row__text{display:flex;flex-direction:column;gap:1px}
.token-row__name{display:flex;align-items:center;gap:6px}
.token-row__name code{font:500 11px var(--mono);color:var(--t1)}
.token-row__value{font:400 10px var(--mono);color:var(--t4)}
.token-row__usage{font:400 10px var(--font);color:var(--t3);margin-left:auto}
.swatch{border-radius:var(--r-s);border:1px solid var(--b2);flex-shrink:0}

/* Text previews */
.text-preview-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.text-preview{background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);padding:16px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.text-preview__sample{font:700 36px var(--font)}
.text-preview__info{display:flex;flex-direction:column;gap:3px;align-items:center}
.text-preview__token-row{display:flex;align-items:center;gap:6px}
.text-preview__token-row code{font:500 11px var(--mono);color:var(--t2)}
.text-preview__hex{font:400 10px var(--mono);color:var(--t3)}
.text-preview__usage{font:400 10px var(--font);color:var(--t4)}

/* Accent cards */
.accent-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.accent-card{background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);overflow:hidden}
.accent-card__top{display:flex;height:48px}
.accent-card__solid{flex:3}
.accent-card__soft{flex:1}
.accent-card__info{padding:12px;display:flex;flex-direction:column;gap:6px}
.accent-card__name{font:700 14px var(--font);letter-spacing:-.02em}
.accent-card__vals{display:flex;flex-direction:column;gap:3px}
.accent-card__val{display:flex;align-items:center;gap:6px;font:400 10px var(--mono);color:var(--t3)}
.accent-card__val code{color:var(--t2);font-size:10px}
.accent-card__usage{font:400 10px var(--font);color:var(--t4)}

/* Tiers */
.tier-row{display:flex;gap:10px}
.tier-chip{flex:1;padding:14px 16px;border:1px solid;border-radius:var(--r-m);display:flex;flex-direction:column;align-items:center;gap:6px}
.tier-chip__name{font:700 14px var(--mono);letter-spacing:.04em}
.tier-chip__vals{display:flex;align-items:center;gap:6px;font:400 10px var(--mono);opacity:.7}

/* Rarity */
.rarity-row{display:flex;gap:8px;flex-wrap:wrap}
.rarity-tag{display:flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid;border-radius:99px;font:500 12px var(--mono)}
.rarity-tag__dot{width:8px;height:8px;border-radius:50%}

/* Font cards */
.font-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.font-card{background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);padding:20px;display:flex;flex-direction:column;gap:8px}
.font-card__sample{font-size:24px;font-weight:600;color:var(--t1)}
.font-card__sample--sans{font-family:'Instrument Sans',system-ui,sans-serif}
.font-card__sample--mono{font-family:'JetBrains Mono',monospace;font-size:20px}
.font-card__token{font:500 11px var(--mono);color:var(--blue)}
.font-card__stack{font:400 10px var(--mono);color:var(--t4)}
.font-card__usage{font:400 11px var(--font);color:var(--t3)}

/* Type scale */
.type-scale{display:flex;flex-direction:column;gap:4px}
.type-row{display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-s)}
.type-row__sample{width:200px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}
.type-row__meta{display:flex;align-items:center;gap:6px;width:120px;flex-shrink:0}
.type-row__meta code{font:500 10px var(--mono);color:var(--t2)}
.type-row__font-tag{font:500 9px var(--mono);color:var(--t4);padding:1px 6px;border:1px solid var(--b2);border-radius:3px}
.type-row__usage{flex:1;font:400 10px var(--font);color:var(--t3)}

/* Weight demo */
.weight-demo{display:flex;flex-direction:column;gap:4px}
.weight-row{display:flex;align-items:center;gap:16px;padding:8px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-s)}
.weight-row__sample{width:48px;font:var(--font);font-size:20px;color:var(--t1);text-align:center;flex-shrink:0}
.weight-row__role{width:100px;font:600 12px var(--font);color:var(--t2);flex-shrink:0}
.weight-row__note{font:400 11px var(--font);color:var(--t3)}

/* Radii */
.radii-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.radius-card{background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px}
.radius-card__preview{width:56px;height:56px;border:2px solid var(--blue);background:rgba(96,165,250,.06)}
.radius-card__info{text-align:center;display:flex;flex-direction:column;gap:3px;align-items:center}
.radius-card__token-row{display:flex;align-items:center;gap:6px}
.radius-card__token-row code{font:500 11px var(--mono);color:var(--t2)}
.radius-card__value{font:600 13px var(--mono);color:var(--t1)}
.radius-card__usage{font:400 10px var(--font);color:var(--t4)}

/* Spacing */
.spacing-list{display:flex;flex-direction:column;gap:4px}
.spacing-row{display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-s)}
.spacing-row__context{width:120px;font:500 12px var(--font);color:var(--t2);flex-shrink:0}
.spacing-row__bar-wrap{width:80px;height:10px;background:var(--s1);border-radius:2px;overflow:hidden;flex-shrink:0}
.spacing-row__bar{height:100%;background:var(--blue);border-radius:2px;min-width:4px}
.spacing-row__value{width:60px;font:600 11px var(--mono);color:var(--t1);flex-shrink:0}
.spacing-row__note{font:400 10px var(--font);color:var(--t3)}

/* Layout demos */
.layout-demos{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.layout-demo{background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);padding:16px;display:flex;flex-direction:column;gap:10px}
.layout-demo__label{font:600 12px var(--font);color:var(--t2)}
.layout-demo__grid{display:flex;gap:4px;height:60px}
.layout-demo__grid--dash .ld-zone--rail{flex:0 0 20px}
.layout-demo__grid--dash .ld-zone--center{flex:1}
.layout-demo__grid--dash .ld-zone--queue{flex:0 0 60px}
.layout-demo__grid--cat .ld-zone--rail{flex:0 0 20px}
.layout-demo__grid--cat .ld-zone--center{flex:1}
.ld-zone{border-radius:4px;display:flex;align-items:center;justify-content:center;font:400 9px var(--mono);color:var(--t3)}
.ld-zone--rail{background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.15)}
.ld-zone--center{background:rgba(52,211,153,.05);border:1px solid rgba(52,211,153,.1)}
.ld-zone--queue{background:rgba(251,191,36,.05);border:1px solid rgba(251,191,36,.1)}
.layout-demo code{font:400 10px var(--mono);color:var(--t4)}

/* Motion */
.motion-list{display:flex;flex-direction:column;gap:8px}
.motion-card{display:flex;align-items:center;gap:16px;padding:12px 16px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m)}
.motion-card__info{flex:1;display:flex;flex-direction:column;gap:4px}
.motion-card__name{font:600 13px var(--font);color:var(--t1)}
.motion-card__css{font:400 10px var(--mono);color:var(--t4)}
.motion-demo{display:flex;align-items:center;gap:10px}
.motion-demo__trigger{padding:4px 12px;border:1px solid var(--b2);border-radius:var(--r-s);background:none;color:var(--blue);font:500 10px var(--mono);cursor:pointer;transition:.15s;width:48px;text-align:center}
.motion-demo__trigger:hover{background:rgba(96,165,250,.06);border-color:var(--blue)}
.motion-demo__stage{width:140px;height:32px;display:flex;align-items:center;gap:4px}
.md-box{width:32px;height:32px;border-radius:var(--r-s);background:var(--blue);opacity:0}
.md-box--sm{width:20px;height:20px;border-radius:4px}
.md-stagger-row{display:flex;gap:4px}

@keyframes mdFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes mdHero{from{opacity:0;transform:translateY(12px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes mdStagger{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes mdPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.75)}}

.md-fade{animation:mdFade .3s ease forwards}
.md-hero{animation:mdHero .4s cubic-bezier(.16,1,.3,1) forwards}
.md-stagger{animation:mdStagger .35s ease forwards;animation-delay:calc(var(--i) * 80ms)}
.md-lift{opacity:1;transition:transform .2s,box-shadow .2s;cursor:pointer}
.md-lift:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(96,165,250,.2)}
.md-dot{width:12px;height:12px;border-radius:50%;background:var(--emerald)}
.md-pulse{animation:mdPulse 2s ease-in-out infinite}
.md-track{width:140px;height:6px;background:var(--s1);border-radius:3px;overflow:hidden}
.md-fill{height:100%;width:0;background:var(--emerald);border-radius:3px;transition:width .6s ease}
.md-fill--go{width:100%}

/* Thresholds */
.threshold-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.threshold-card{background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.threshold-card__ring{width:52px;height:52px;border-radius:50%;border:3px solid;display:flex;align-items:center;justify-content:center}
.threshold-card__ring span{font:700 13px var(--mono)}
.threshold-card__label{font:700 14px var(--font)}
.threshold-card__desc{font:400 11px var(--font);color:var(--t3);line-height:1.3}

/* Metric demo */
.metric-demo{display:flex;flex-direction:column;gap:6px;padding:16px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m)}
.metric-row{display:flex;align-items:center;gap:8px}
.metric-row__label{width:60px;font:400 11px var(--mono);color:var(--t3)}
.metric-row__track{flex:1;height:4px;background:var(--s1);border-radius:2px;overflow:hidden}
.metric-row__fill{height:100%;border-radius:2px}
.metric-row__val{width:36px;font:500 11px var(--mono);text-align:right}
.metric-legend{display:flex;gap:16px;margin-top:8px;padding-top:8px;border-top:1px solid var(--b1)}
.metric-legend span{display:flex;align-items:center;gap:4px;font:400 10px var(--mono);color:var(--t3)}
.ml-dot{width:6px;height:6px;border-radius:50%}

/* Badge demo */
.badge-demo{display:flex;gap:8px}
.cond-badge{font:600 11px var(--mono);padding:5px 14px;border-radius:99px;border:1px solid;letter-spacing:.04em}

/* Code block */
.code-block{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-s);margin-bottom:6px}
.code-block code{font:400 11px var(--mono);color:var(--t2);flex:1}

/* Expansion demo */
.expansion-demo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.exp-demo-card{position:relative;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);padding:16px;overflow:hidden;transition:.2s}
.exp-demo-card:hover{border-color:color-mix(in srgb,var(--ec1) 40%,transparent)}
.exp-demo-card__glow{position:absolute;inset:0;background:radial-gradient(ellipse 100% 80% at 50% -20%,color-mix(in srgb,var(--ec1) 10%,transparent) 0%,transparent 70%);pointer-events:none}
.exp-demo-card__name{display:block;font:600 13px var(--font);color:var(--t1);position:relative;margin-bottom:8px}
.exp-demo-card__swatches{display:flex;gap:4px;margin-bottom:8px;position:relative}
.exp-demo-card__sw{width:28px;height:20px;border-radius:4px;border:1px solid rgba(255,255,255,.1)}
.exp-demo-card__vals{display:flex;flex-wrap:wrap;gap:6px;align-items:center;position:relative}
.exp-demo-card__vals code{font:400 10px var(--mono);color:var(--t3)}
`;
