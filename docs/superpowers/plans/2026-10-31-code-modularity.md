# Code Modularity Implementation Plan

> **For agentic workers:** Use `subagent-driven-development` for one coordinated refactoring task, followed by independent specification and quality reviews. Do not run simultaneous implementers against this module graph.

**Goal:** separate the responsibilities of the eleven identified production modules without changing application behavior.

**Architecture:** feature-local hooks and React components; pure quote-editor model modules with a compatibility facade; PDF/source operations separated from quote persistence. Public exports and existing test imports remain compatible.

**Tech Stack:** Next.js 16.4.3, React 19, TypeScript, Zod, Supabase, Vitest, Playwright.

## Task 1 — coherent extraction of production modules

- [x] Read the installed Next.js guides for `use client`, forms and server/client boundaries before editing. Read all eleven original files and map their local dependencies. Preserve the current named exports.
- [x] Extract the pure quote editor into `src/lib/quotes/editor/`: `types.ts` for exported contracts, `state.ts` for initialization/template application, `reducer.ts` for actions, `validation.ts` for schema/payload, and `document.ts` for dirty/document/pending derivations. Shared key/number constants and helpers belong in a small focused module if multiple leaves need them. Keep `src/lib/quotes/editor.ts` as the explicit compatibility facade. Leaf modules must import each other directly, with type-only imports for contracts.
- [x] Extract quote-editor lifecycle/save/conflict code into `use-quote-editor.ts`, action lifecycle into `use-quote-actions.ts` plus focused contracts/helpers, and PDF generation/cancellation into `use-quote-preview.ts`. Existing JSX files should compose the returned state and actions. Preserve draft application before save, render-time adoption of server versions, stable refs and request cancellation.
- [x] Extract the grid's `HeaderSection`, editable `RowItem`, drag/menu behavior and grid constants into feature-local modules. Move focus/drag coordination into a hook only where it has a genuine lifecycle responsibility. Keep the original `CardItems` public component and its props.
- [x] Extract `EditorBlock` and its editor lifecycle/toolbar where it reduces coupling; preserve selection, native undo/redo and focus restoration. Extract `SelectorTemplate` and `InputDate` from `card-data.tsx` and confirmations from `bands-editor.tsx` into named feature components. Keep all visible markup and handler semantics equivalent.
- [x] Extract document state/loading/submit into `use-document-form.ts`, pure initialization/filtering into a document-form model helper, and document sections into focused components. Keep `DocumentForm` props compatible. Preserve stale-response guards, file state, invoice allocation behavior and duplicate-submit protection.
- [x] Extract quote-filter shared fields, date selector and mobile sheet from `filters-quotes.tsx`; keep optimistic URL/filter synchronization together in a focused hook when useful. Preserve back-navigation, debounce, mobile drafts and date validation.
- [x] Separate source/PDF operations from quote CRUD and status service functions. Keep `src/lib/quotes/service.ts` exports compatible and preserve server-only use through its callers and existing Supabase parameter injection.
- [x] Run the existing unit tests after each meaningful group using `npm test -- src/lib/quotes` and `npm run typecheck`. Do not add tests that merely assert file structure or weaken existing assertions. Fix extraction mistakes without bundling new features.
- [x] Self-review the diff for circular imports, behavior drift, new unnecessary abstractions, duplicated state, hook closure mistakes and generated/vendor files. Report changed modules and before/after entry-file sizes.

## Task 2 — independent review and end-to-end verification

- [x] Independently inspect the complete diff against the design and all eleven target modules. Resolve any missing extraction or behavior change before the quality review.
- [x] Review code quality after specification approval: cohesion, hook ownership, typed interfaces, dependency direction, imports and error handling. Resolve material findings and repeat the relevant review.
- [x] Run `npm run check`, `npm run build`, `npm run test:runner`, `npm run test:int` and `npm run test:e2e`. Integration and browser tests must only use the provided disposable runner.
- [x] Verify destruction of the temporary projects and `git diff --check`. Record the final module inventory and material limitations.
- [x] Commit the reviewed refactor and final verification report.

Publication follows the established main/Railway workflow; the exact deployment must reach SUCCESS before it is reported as published. No database migration is expected.

## Verification results

483 unit tests, 20 historical importer tests, 12 runner tests, 342 integration tests and 75 browser tests pass. The final legacy-block adapter has additional failing-first coverage and 3 passing targeted browser tests. Lint, TypeScript and the production build pass. All temporary test projects are destroyed.

The review also restored pre-existing renamed SQL/JSON/manifest contracts and corrected two shadowed dependency names. English module/function names remain; external persisted/wire keys retain compatibility.
