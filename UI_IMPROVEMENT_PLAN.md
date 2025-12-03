# UI Improvement Plan: Dental Prospect Finder

The goal is to transform the current "neon dark" UI into a **Clean, Professional, Modern Dashboard** (inspired by Linear, Vercel, and high-end SaaS tools).

## 1. Design Philosophy
- **Theme**: "Professional Dark" (Deep grays, not pure black).
- **Typography**: `Inter` font with strict hierarchy (Bold headings, muted subtitles).
- **Colors**:
  - Background: `#0F1117` (Deep Navy/Gray)
  - Surface: `#1E212B` (Lighter Gray for cards)
  - Primary: `#3B82F6` (Professional Blue) or `#6366F1` (Indigo) - moving away from "Neon Purple".
  - Text: `#F3F4F6` (Primary), `#9CA3AF` (Secondary).
  - Borders: `#2D3748` (Subtle).
- **Layout**: Sidebar + Main Content area (instead of top-heavy header).

## 2. Todo List

### Phase 1: Foundation & Layout
- [ ] **Reset CSS**: Replace `index.css` with a complete modern CSS reset and variable system.
- [ ] **Typography**: Configure `Inter` font weights (400, 500, 600) and line heights.
- [ ] **Layout Structure**: Refactor `App.jsx` to use a `Sidebar` + `MainContent` layout.
  - Move "History/Jobs" to the Sidebar.
  - Move "API Usage" to the bottom of the Sidebar.
  - Keep the main area for the "Scraper Form" and "Results Table".

### Phase 2: Component Redesign
- [ ] **Search Form**: Redesign the input fields to be large, clean, and focus-driven.
  - Add a "glass" effect to the search container.
  - Make the "Scrape" button prominent and satisfying to click.
- [ ] **Results Table**:
  - Convert the table to a "Card List" or a very clean Data Grid.
  - Sticky headers.
  - Row hover effects (subtle background shift).
  - Status badges (New, Contacted, etc.) with pill styling.
- [ ] **AI Chat Interface**:
  - Make it look like a modern messenger (iMessage/ChatGPT style).
  - Distinct bubbles for User vs AI.
  - Typing indicators.

### Phase 3: Visual Polish
- [ ] **Animations**: Add subtle entry animations for list items (fade-in + slide-up).
- [ ] **Empty States**: Add SVG icons/illustrations for "No results found" or "Start a search".
- [ ] **Loading States**: Replace text loading with Skeleton loaders or a nice spinner.
- [ ] **Mobile Responsiveness**: Ensure it stacks correctly on smaller screens (though primarily a desktop tool).

## 3. Implementation Steps
1.  **Rewrite `index.css`**: This is the biggest impact. I will replace the entire file with the new design system.
2.  **Refactor `App.jsx`**: I will modify the render method to match the new CSS classes and layout structure.
3.  **Add Icons**: Use simple SVG icons (inline) for the sidebar and actions to reduce dependency issues.

Let's get to work!
