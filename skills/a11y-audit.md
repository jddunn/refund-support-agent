---
name: a11y-audit
description: Audit the three routes for accessibility (keyboard, ARIA, contrast, tap targets). Use before merge or when asked for an accessibility check.
---

# Accessibility audit

With a Chrome DevTools MCP available, audit `/chat`, `/admin/traces`, and `/admin/policy`:

1. Navigate to each route.
2. Check semantic structure: one h1, labelled controls, the chat log as a live region, the run timeline as a list, the results as a table with header cells.
3. Tab through every interactive element. Focus must be visible and ordered, and every action reachable by gesture must be reachable by keyboard.
4. Check tap targets are at least 44px, color contrast meets WCAG AA, and reduced motion is respected.
5. Record findings per route with the WCAG criterion each maps to.

Defer to the Chrome DevTools accessibility debugging workflow for the detailed checks.
