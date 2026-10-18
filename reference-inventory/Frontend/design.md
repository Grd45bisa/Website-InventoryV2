# Genesis × Docuflow-nemo — Design System

**Platform:** Developer community for discovering, sharing, and managing design system files, with an integrated inventory dashboard.  
**Audience:** Front-end engineers and design-system authors who are used to Figma, Linear, and Vercel — they have high visual standards and zero patience for clutter.  
**Tone:** Quiet authority. The interface recedes; the work comes forward.

---

## Philosophy

This system has one job: make design artifacts feel as trustworthy as source code. That means:

- **Precision over decoration.** No gradients, no drop shadows on resting elements, no decorative blobs. Every visual element earns its place.
- **Grid as identity.** An 8px base grid is not just a spacing tool — it governs corner radii, icon sizes, and layout rhythms. Rounding and sizing always land on multiples of 4 or 8.
- **Typography does the heavy lifting.** Strong type hierarchy means less reliance on color to communicate rank.
- **Color is purposeful, not ambient.** The indigo accent exists only on interactive elements. Every other chromatic decision follows semantic intent.

---

## Color Tokens

Color names describe *role*, not value. Never use a token outside its declared role.

### Light Mode

```css
:root {
  /* Surfaces */
  --color-bg:          #F7F7F8;   /* Page background — cool off-white */
  --color-surface:     #FFFFFF;   /* Cards, panels, modals */
  --color-surface-alt: #F2F2F5;   /* Hover rows, sidebar tray, code blocks */
  --color-overlay:     rgba(10, 10, 10, 0.40); /* Modal scrim */

  /* Borders */
  --color-border:      #E4E4E9;   /* Default dividers, card outlines */
  --color-border-subtle: #EEEEEF; /* Table row dividers, intra-card lines */
  --color-border-focus: #6366F1;  /* Focus rings — same as interactive */

  /* Text */
  --color-text-primary:   #0D0D0F; /* Headings, labels */
  --color-text-secondary: #6C6C78; /* Descriptions, metadata */
  --color-text-muted:     #A1A1AA; /* Placeholders, timestamps, disabled */
  --color-text-inverse:   #FFFFFF; /* Text on filled dark or indigo surfaces */
  --color-text-link:      #6366F1; /* Inline links */

  /* Interactive (Indigo — exclusively for interactive elements) */
  --color-interactive:       #6366F1;
  --color-interactive-hover: #4F46E5;
  --color-interactive-light: rgba(99, 102, 241, 0.08);
  --color-interactive-ring:  rgba(99, 102, 241, 0.16);

  /* Brand accent (Genesis logo / homepage callout only) */
  --color-brand-accent: #1A9A06;

  /* Semantic */
  --color-success:         #16A34A;
  --color-success-surface: #F0FDF4;
  --color-warning:         #D97706;
  --color-warning-surface: #FFFBEB;
  --color-danger:          #DC2626;
  --color-danger-surface:  #FEF2F2;
  --color-info:            #0284C7;
  --color-info-surface:    #F0F9FF;
}
```

### Dark Mode

Dark mode uses the same token names; values shift to preserve contrast ratios.

```css
[data-theme="dark"] {
  /* Surfaces */
  --color-bg:          #0C0C10;
  --color-surface:     #131318;
  --color-surface-alt: #1A1A22;
  --color-overlay:     rgba(0, 0, 0, 0.60);

  /* Borders */
  --color-border:        #26262F;
  --color-border-subtle: #1E1E26;
  --color-border-focus:  #818CF8;

  /* Text */
  --color-text-primary:   #F4F4F6;
  --color-text-secondary: #8E8E9E;
  --color-text-muted:     #4B4B5A;
  --color-text-inverse:   #0C0C10;
  --color-text-link:      #818CF8;

  /* Interactive */
  --color-interactive:       #818CF8;
  --color-interactive-hover: #6366F1;
  --color-interactive-light: rgba(129, 140, 248, 0.10);
  --color-interactive-ring:  rgba(129, 140, 248, 0.18);

  /* Brand accent */
  --color-brand-accent: #22C55E;

  /* Semantic */
  --color-success:         #22C55E;
  --color-success-surface: #052E16;
  --color-warning:         #F59E0B;
  --color-warning-surface: #1C1100;
  --color-danger:          #F87171;
  --color-danger-surface:  #1E0A0A;
  --color-info:            #38BDF8;
  --color-info-surface:    #03111D;
}
```

### Palette at a Glance

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-bg` | `#F7F7F8` | `#0C0C10` | Page background |
| `--color-surface` | `#FFFFFF` | `#131318` | Cards, panels |
| `--color-border` | `#E4E4E9` | `#26262F` | Default dividers |
| `--color-interactive` | `#6366F1` | `#818CF8` | CTAs, links, active states |
| `--color-text-primary` | `#0D0D0F` | `#F4F4F6` | Body text, headings |
| `--color-brand-accent` | `#1A9A06` | `#22C55E` | Genesis brand mark only |

---

## Typography

Three typefaces. Each has a single job — they do not overlap.

| Role | Family | Source |
|---|---|---|
| Display & headings | **General Sans** | Fontshare |
| Body, UI, labels | **DM Sans** | Google Fonts |
| Code, monospaced data | **JetBrains Mono** | Google Fonts |

```html
<!-- Paste in <head>, before any stylesheets -->
<link rel="preconnect" href="https://api.fontshare.com">
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
:root {
  --font-display: 'General Sans', system-ui, sans-serif;
  --font-body:    'DM Sans', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', monospace;
}
```

### Type Scale

```css
:root {
  /* Scale */
  --text-display:  72px; /* Homepage hero only */
  --text-headline: 48px; /* Section heroes, page titles */
  --text-section:  32px; /* Section headings */
  --text-subhead:  22px; /* Card titles, sub-sections */
  --text-body-lg:  16px; /* Feature descriptions */
  --text-body:     14px; /* Default body, table cells */
  --text-small:    13px; /* Metadata, secondary labels */
  --text-caption:  12px; /* Timestamps, bylines */
  --text-overline: 11px; /* Category labels — uppercase, tracked */

  /* Tracking */
  --tracking-display: -0.04em;
  --tracking-headline: -0.03em;
  --tracking-section: -0.02em;
  --tracking-overline: 0.08em;  /* Loose for uppercase labels */

  /* Line height */
  --leading-display:  1.05;
  --leading-heading:  1.2;
  --leading-body:     1.6;
  --leading-code:     1.7;
}
```

**Rules:**
- General Sans for `--text-display` through `--text-subhead`, weight 600 or 700 only.
- DM Sans for `--text-body-lg` through `--text-overline`, weight 400 or 500 only.
- Max two weights on a single screen.
- Overline labels: `text-transform: uppercase`, `letter-spacing: var(--tracking-overline)`, `font-family: var(--font-body)`, `font-weight: 500`.

---

## Spacing & Layout Grid

**Base unit: 8px.** All spacing is a multiple of 4px, strongly preferred to be a multiple of 8px.

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
}
```

### Layout

```css
:root {
  --layout-max-width:     1280px;
  --layout-gutter:        24px;   /* Horizontal padding on container */
  --layout-section-gap:   64px;   /* Between page sections (desktop) */
  --layout-section-gap-m: 40px;   /* Between page sections (mobile) */
  --layout-card-gap:      20px;   /* Grid gap between cards */
}
```

### Breakpoints

```css
/* Mobile-first */
/* xs  — default            ≤ 576px  */
/* sm  — @media (min-width: 577px)   */
/* md  — @media (min-width: 768px)   */
/* lg  — @media (min-width: 1024px)  */
/* xl  — @media (min-width: 1280px)  */
```

---

## Border Radius

All radii are multiples of 4px. Radii are assigned by *surface size*, not component type.

```css
:root {
  --radius-xs:   4px;  /* Inline badges, code chips, tags */
  --radius-sm:   6px;  /* Buttons, inputs, selects, dropdowns */
  --radius-md:   8px;  /* Metadata cards, popovers, tooltips */
  --radius-lg:   12px; /* Kit preview cards, modals, panels */
  --radius-xl:   16px; /* Large feature surfaces, search bars */
  --radius-full: 9999px; /* Avatars, status dots, pill badges */
}
```

**Do not mix `--radius-lg` and `--radius-sm` on the same component** (e.g. a card with `--radius-lg` must not contain a button that uses a different radius tier for its own container).

---

## Elevation & Shadow

Shadows convey *interaction state*, not hierarchy. Resting elements are flat.

```css
:root {
  /* Resting: no shadow — use border only */
  --shadow-none: none;

  /* Focus ring — not a shadow; uses outline */
  --shadow-focus: 0 0 0 3px var(--color-interactive-ring);

  /* Hover lift on cards */
  --shadow-card-hover: 0 8px 24px rgba(0, 0, 0, 0.07), 0 2px 6px rgba(0, 0, 0, 0.04);

  /* Button glow on primary hover */
  --shadow-btn-hover: 0 4px 14px rgba(99, 102, 241, 0.30);

  /* Dropdowns, popovers, modals */
  --shadow-popover: 0 8px 32px rgba(0, 0, 0, 0.10), 0 2px 8px rgba(0, 0, 0, 0.06);

  /* Sticky nav (backdrop-blur preferred; shadow as fallback) */
  --shadow-nav: 0 1px 0 var(--color-border);
}
```

**Dark mode:** multiply shadow opacity by ×2.5 (shadows are invisible on very dark backgrounds otherwise).

---

## Transitions & Motion

```css
:root {
  --ease-out:   cubic-bezier(0.16, 1, 0.3, 1);   /* Element enters */
  --ease-in:    cubic-bezier(0.4, 0, 1, 1);        /* Element exits */
  --ease-inout: cubic-bezier(0.4, 0, 0.2, 1);      /* State changes */

  --duration-fast:   120ms; /* Hover color/bg changes */
  --duration-base:   200ms; /* Card lifts, button states */
  --duration-slow:   320ms; /* Modals, drawers, page transitions */
}

/* Base interactive transition */
.interactive {
  transition:
    color        var(--duration-fast) var(--ease-inout),
    background   var(--duration-fast) var(--ease-inout),
    border-color var(--duration-fast) var(--ease-inout),
    box-shadow   var(--duration-base) var(--ease-out),
    transform    var(--duration-base) var(--ease-out),
    opacity      var(--duration-base) var(--ease-inout);
}

@media (prefers-reduced-motion: reduce) {
  .interactive,
  .card-hover,
  [class*="animate-"] {
    transition: none !important;
    animation:  none !important;
  }
}
```

---

## Components

### Button

Four variants. One primary per view section — no exceptions.

```css
/* Shared base */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid transparent;
  transition: inherit; /* from .interactive on the element */
}

/* Sizes */
.btn-sm { height: 32px; padding: 0 var(--space-3); font-size: 13px; }
.btn-md { height: 36px; padding: 0 var(--space-4); font-size: 14px; }
.btn-lg { height: 44px; padding: 0 var(--space-6); font-size: 15px; }

/* Primary */
.btn-primary {
  background:   var(--color-interactive);
  color:        var(--color-text-inverse);
  border-color: var(--color-interactive);
}
.btn-primary:hover {
  background:   var(--color-interactive-hover);
  border-color: var(--color-interactive-hover);
  box-shadow:   var(--shadow-btn-hover);
  transform:    translateY(-1px);
}
.btn-primary:active { transform: translateY(0); box-shadow: none; }

/* Secondary (outlined) */
.btn-secondary {
  background:   transparent;
  color:        var(--color-text-primary);
  border-color: var(--color-border);
}
.btn-secondary:hover {
  background:   var(--color-surface-alt);
  border-color: var(--color-text-muted);
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}
.btn-ghost:hover {
  background: var(--color-surface-alt);
  color: var(--color-text-primary);
}

/* Destructive */
.btn-danger {
  background:   transparent;
  color:        var(--color-danger);
  border-color: var(--color-danger);
}
.btn-danger:hover {
  background: var(--color-danger-surface);
}

/* Focus (all variants) */
.btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
```

---

### Input & Select

```css
.input {
  display: block;
  width: 100%;
  height: 36px;
  padding: 0 var(--space-3);
  background:   var(--color-surface);
  border:       1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family:  var(--font-body);
  font-size:    14px;
  color:        var(--color-text-primary);
  transition:   border-color var(--duration-fast) var(--ease-inout),
                box-shadow   var(--duration-fast) var(--ease-inout);
}

.input::placeholder { color: var(--color-text-muted); }

.input:hover { border-color: var(--color-text-muted); }

.input:focus {
  outline:      none;
  border-color: var(--color-border-focus);
  box-shadow:   var(--shadow-focus);
}

.input-error {
  border-color: var(--color-danger);
}
.input-error:focus {
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14);
}
```

---

### Card (Kit Preview)

```css
.card {
  background:    var(--color-surface);
  border:        1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow:      hidden;
  transition:    transform    var(--duration-base) var(--ease-out),
                 box-shadow   var(--duration-base) var(--ease-out),
                 border-color var(--duration-fast) var(--ease-inout);
}

.card:hover {
  transform:    translateY(-2px);
  box-shadow:   var(--shadow-card-hover);
  border-color: var(--color-border-focus);
}

/* Image area — fixed aspect ratio */
.card-media {
  aspect-ratio: 16 / 9;
  background:   var(--color-surface-alt);
  overflow:     hidden;
}
.card-media img {
  width: 100%; height: 100%;
  object-fit: cover;
  transition: transform 400ms var(--ease-out);
}
.card:hover .card-media img {
  transform: scale(1.03);
}

/* Content area */
.card-body {
  padding: var(--space-4);
}

.card-title {
  font-family:     var(--font-display);
  font-size:       var(--text-subhead);
  font-weight:     600;
  letter-spacing:  var(--tracking-section);
  color:           var(--color-text-primary);
  margin-bottom:   var(--space-1);
}

.card-meta {
  font-size:  var(--text-small);
  color:      var(--color-text-muted);
}
```

---

### Navigation

```css
.nav {
  position:     sticky;
  top:          0;
  z-index:      100;
  height:       56px;
  display:      flex;
  align-items:  center;
  padding:      0 var(--space-6);
  background:   rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border-bottom: 1px solid var(--color-border);
}

[data-theme="dark"] .nav {
  background: rgba(19, 19, 24, 0.85);
}

.nav-link {
  font-family:  var(--font-body);
  font-size:    14px;
  font-weight:  500;
  color:        var(--color-text-secondary);
  padding:      var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  text-decoration: none;
  transition:   color     var(--duration-fast) var(--ease-inout),
                background var(--duration-fast) var(--ease-inout);
}

.nav-link:hover {
  color:      var(--color-text-primary);
  background: var(--color-surface-alt);
}

.nav-link[aria-current="page"] {
  color: var(--color-interactive);
}
```

---

### Badge / Chip

```css
/* Tag chip */
.chip {
  display:       inline-flex;
  align-items:   center;
  height:        24px;
  padding:       0 var(--space-3);
  border-radius: var(--radius-full);
  font-family:   var(--font-body);
  font-size:     var(--text-caption);
  font-weight:   500;
  background:    var(--color-surface-alt);
  color:         var(--color-text-secondary);
  border:        1px solid var(--color-border);
}

.chip-active {
  background:   var(--color-interactive);
  color:        var(--color-text-inverse);
  border-color: var(--color-interactive);
}

/* Status chips */
.chip-success { background: var(--color-success-surface); color: var(--color-success); border-color: transparent; }
.chip-warning { background: var(--color-warning-surface); color: var(--color-warning); border-color: transparent; }
.chip-danger  { background: var(--color-danger-surface);  color: var(--color-danger);  border-color: transparent; }
.chip-info    { background: var(--color-info-surface);    color: var(--color-info);    border-color: transparent; }
```

---

### Table / List Row

For the dashboard inventory view.

```css
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  font-family:    var(--font-body);
  font-size:      var(--text-overline);
  font-weight:    500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-overline);
  color:          var(--color-text-muted);
  padding:        var(--space-2) var(--space-4);
  border-bottom:  1px solid var(--color-border);
  text-align:     left;
}

.table td {
  font-size:    var(--text-body);
  color:        var(--color-text-primary);
  padding:      var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border-subtle);
}

.table tr:hover td {
  background: var(--color-surface-alt);
}

.table tr:last-child td {
  border-bottom: none;
}
```

---

### Code Block

```css
.code-block {
  background:    var(--color-surface-alt);
  border:        1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding:       var(--space-4) var(--space-5);
  font-family:   var(--font-mono);
  font-size:     13px;
  line-height:   var(--leading-code);
  color:         var(--color-text-primary);
  overflow-x:    auto;
}

/* Inline code */
code:not(.code-block code) {
  font-family:   var(--font-mono);
  font-size:     0.875em;
  background:    var(--color-surface-alt);
  border:        1px solid var(--color-border);
  border-radius: var(--radius-xs);
  padding:       1px 5px;
}
```

---

### Search Bar

```css
.search-bar {
  display:        flex;
  align-items:    center;
  gap:            var(--space-2);
  height:         44px;
  padding:        0 var(--space-4);
  background:     var(--color-surface);
  border:         1px solid var(--color-border);
  border-radius:  var(--radius-xl);
  font-family:    var(--font-body);
  font-size:      14px;
  color:          var(--color-text-primary);
  cursor:         text;
  transition:     border-color var(--duration-fast) var(--ease-inout),
                  box-shadow   var(--duration-fast) var(--ease-inout);
}

.search-bar:focus-within {
  border-color: var(--color-border-focus);
  box-shadow:   var(--shadow-focus);
}

.search-shortcut {
  margin-left: auto;
  font-size:   11px;
  font-family: var(--font-mono);
  color:       var(--color-text-muted);
  background:  var(--color-surface-alt);
  border:      1px solid var(--color-border);
  border-radius: var(--radius-xs);
  padding:     2px 6px;
}
```

---

## Dashboard Layout (Docuflow-nemo)

The dashboard follows a sidebar + main content pattern.

```
┌──────────────────────────────────────────────────────┐
│  NAV (56px, sticky)                                  │
├──────────┬───────────────────────────────────────────┤
│          │  HEADER (page title + actions)  ~64px     │
│ SIDEBAR  ├───────────────────────────────────────────┤
│ 240px    │  CONTENT AREA                             │
│ (fixed   │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  desktop)│  │  STAT    │ │  STAT    │ │  STAT    │  │
│          │  │  CARD    │ │  CARD    │ │  CARD    │  │
│          │  └──────────┘ └──────────┘ └──────────┘  │
│          │                                           │
│          │  ┌────────────────────────────────────┐   │
│          │  │  TABLE / LIST                      │   │
│          │  └────────────────────────────────────┘   │
└──────────┴───────────────────────────────────────────┘
```

```css
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 56px 1fr;
  min-height: 100vh;
}

.sidebar {
  grid-row: 2 / -1;
  background:   var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding:      var(--space-4) var(--space-3);
  overflow-y:   auto;
  position:     sticky;
  top:          56px;
  height:       calc(100vh - 56px);
}

.main-content {
  padding: var(--space-8) var(--space-8);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .sidebar {
    display: none; /* replaced by drawer */
  }
  .main-content {
    padding: var(--space-4) var(--space-4);
  }
}
```

---

## Sidebar Navigation (Docuflow-nemo)

```css
.sidebar-section-label {
  font-size:      var(--text-overline);
  font-family:    var(--font-body);
  font-weight:    500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-overline);
  color:          var(--color-text-muted);
  padding:        var(--space-2) var(--space-3);
  margin-top:     var(--space-4);
}

.sidebar-link {
  display:       flex;
  align-items:   center;
  gap:           var(--space-3);
  height:        36px;
  padding:       0 var(--space-3);
  border-radius: var(--radius-sm);
  font-size:     14px;
  font-weight:   500;
  color:         var(--color-text-secondary);
  text-decoration: none;
  transition:    background var(--duration-fast) var(--ease-inout),
                 color      var(--duration-fast) var(--ease-inout);
}

.sidebar-link:hover {
  background: var(--color-surface-alt);
  color:      var(--color-text-primary);
}

.sidebar-link[aria-current="page"] {
  background: var(--color-interactive-light);
  color:      var(--color-interactive);
}

.sidebar-link-icon {
  width: 16px; height: 16px;
  flex-shrink: 0;
  opacity: 0.7;
}

.sidebar-link[aria-current="page"] .sidebar-link-icon {
  opacity: 1;
}
```

**Navigation groups (Docuflow-nemo sidebar):**

| Group | Items |
|---|---|
| Utama | Dasbor, Aktivitas |
| Katalog | Produk, Kategori, Stok |
| Laporan | Penjualan, Keuangan, Ekspor |
| Tim | Anggota, Peran, Undangan |
| Sistem | Pengaturan, Log Audit, API |

**Role visibility:**
- `staff` — sees Utama + Katalog only
- `admin` — sees Utama + Katalog + Laporan + Tim
- `owner` — sees all groups

---

## Stat Card (Dashboard Metric)

```css
.stat-card {
  background:    var(--color-surface);
  border:        1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding:       var(--space-5) var(--space-6);
}

.stat-label {
  font-family:    var(--font-body);
  font-size:      var(--text-overline);
  font-weight:    500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-overline);
  color:          var(--color-text-muted);
  margin-bottom:  var(--space-2);
}

.stat-value {
  font-family:    var(--font-display);
  font-size:      var(--text-section); /* 32px */
  font-weight:    700;
  letter-spacing: var(--tracking-section);
  color:          var(--color-text-primary);
  line-height:    1.1;
}

.stat-delta {
  font-size:  var(--text-small);
  font-weight: 500;
  margin-top: var(--space-1);
}
.stat-delta.positive { color: var(--color-success); }
.stat-delta.negative { color: var(--color-danger);  }
```

---

## Homepage (Genesis)

### Dot Grid Background

The only decorative element in the entire system. Used exclusively on the Genesis homepage hero. Never use elsewhere.

```css
.hero-grid {
  background-image: radial-gradient(
    circle,
    var(--color-border) 1px,
    transparent 1px
  );
  background-size: 24px 24px;
  background-position: center center;
}
```

### Hero Typography

```css
.hero-eyebrow {
  font-family:    var(--font-body);
  font-size:      var(--text-overline);
  font-weight:    500;
  text-transform: uppercase;
  letter-spacing: var(--tracking-overline);
  color:          var(--color-brand-accent); /* Green — only usage outside interactive */
}

.hero-title {
  font-family:    var(--font-display);
  font-size:      clamp(40px, 6vw, var(--text-display));
  font-weight:    700;
  letter-spacing: var(--tracking-display);
  color:          var(--color-text-primary);
  line-height:    var(--leading-display);
}

.hero-subtitle {
  font-family: var(--font-body);
  font-size:   var(--text-body-lg);
  color:       var(--color-text-secondary);
  max-width:   540px;
  line-height: var(--leading-body);
}
```

---

## Rules & Anti-Patterns

### ✅ Do

- Use `--color-interactive` only on buttons, links, active nav states, focus rings, and selected chips.
- Keep `--color-brand-accent` (green) exclusively for the Genesis homepage eyebrow and logo mark.
- Apply `box-shadow` only on `:hover` and `:focus-visible` states — never on resting elements.
- Use General Sans for all headings, DM Sans for all body text. Never swap.
- Keep button heights on the defined sizes (32 / 36 / 44px). Avoid custom heights.
- Maintain the 8px grid for all layout spacing; 4px is acceptable for intra-component detail only.
- Test all color pairs against WCAG AA (4.5:1 for body text, 3:1 for large text and UI components).
- Add `@media (prefers-reduced-motion: reduce)` guard on every animation and transition.

### ❌ Don't

- Don't use gradients. Not on buttons, not on backgrounds, not on text.
- Don't use `--color-interactive` for static decorative elements or section dividers.
- Don't use pure `#000000` or `#FFFFFF` for text — always use the defined text tokens.
- Don't add `box-shadow` to resting cards, buttons, or inputs.
- Don't mix `--radius-lg` (cards) and `--radius-sm` (buttons) on the same sub-component.
- Don't stack more than two semantic colors on a single row or card.
- Don't use the dot grid background on any page other than the Genesis homepage hero.
- Don't place more than one `.btn-primary` in the same view section.
- Don't use more than two font weights on a single screen.
- Don't animate elements that don't benefit from motion (static text, static dividers).