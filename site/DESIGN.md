# packfence design brief

**Reference object:** airport baggage X-ray operator console — the security screening monitor that shows a suitcase cross-section. Packed files appear as amber phosphor silhouettes; HOLD items flash.

**Metaphor:** npm tarball = suitcase on the belt; each packed file = an X-ray silhouette; CLEAR = teal stamp; HOLD = amber flash then red HOLD tag; `packfence` = the operator console that decides before the bag leaves for the plane (`npm publish`).

- **Base tone:** deep navy panel `#0a1628` (unique mid-dark blue — not certfan near-black, not actnode asphalt).
- **Palette:** `#0a1628` navy panel · `#f4b942` amber phosphor · `#c5d0dc` bone labels · `#2f6f5e` CLEAR teal · `#b33a3a` HOLD · `#1a2a40` panel recess. No unused hex shared with other projects.
- **Type:** Oxanium 400–700 (titles/readouts) + Figtree 400/600 (body) + Azeret Mono 400/500 (commands/paths only). Self-hosted woff2.
- **Texture:** flat CRT scanline ONLY as 1px repeating CSS linear-gradient at ~4% opacity (not glow, not glass).
- **Rendering:** flat SVG suitcase X-ray cross-section (no 3D, no isometric, no metro lines).
- **Layout:** full-width operator console as hero; h1 is the console title bar text "PACKFENCE — PRE-PUBLISH SCAN"; findings appear as a scrolling strip of scanned items with CLEAR/HOLD tags; docs sections as "BAY" panels below.
- **Motion:** suitcase enters belt → X-ray sweep → items peel into CLEAR (teal) or HOLD (amber flash then HOLD tag); respects `prefers-reduced-motion`.
- **Logo:** rectangular X-ray monitor bezel (not rounded app icon) with amber suitcase silhouette on navy; transparent background.
- **OG / social preview:** same console crop with title bar and a HOLD finding strip.

## Banned-list self check
No dark base + cyan/purple gradient · no gradient text · no glow · no glassmorphism · no left-copy/right-card hero (hero is full-width console) · no three feature cards · no Inter + mono default (Oxanium + Figtree + Azeret Mono) · no paper/print/stamp/typewriter · no line-by-line printing · no hard-shadow paper stacks · no rounded-square app-icon logo · no beige/kraft · no red-ink annotations (HOLD uses `#b33a3a`, not toolsmoke crimson).

## Differences from every registered project
- toolsmoke (warm paper report): navy console, no paper/ink/stamps.
- agentckpt (Game Boy pixels): flat vector console, no pixels, no steps().
- certfan (near-black generative fan): mid-dark navy (not near-black), amber phosphor readouts, suitcase X-ray not fan lines.
- linelore (Swiss poster, white + orange): dark console, not type-as-image.
- runbill (isometric block city): flat 2D X-ray, no 3D/isometric.
- actnode (highway signs, saturated green): navy panel not green sign face; Oxanium not Overpass.
- drainready (container port): X-ray monitor not side-elevation ship; no stencil type.
- postsleuth (metro map, lilac): dark navy not lilac; console not octilinear map.
- rackhands (brass vault): navy CRT console not brass box wall; no CSS 3D hinges.
