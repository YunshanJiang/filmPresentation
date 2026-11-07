# Paint reveal masks v1

Generated using the built-in imagegen tool. All four PNGs are 2172 x 724 RGBA with alpha range 0..255. White paint is visible; the surrounding area is transparent. Originals preserved without pixel edits. These assets are prepared for reveal animation; reveal animation is wired into pages 02 through 10, with a broad alpha gradient.

## Prompts

### 01-flat

Single broad horizontal flat paintbrush stroke, very wide 4:1 shape. Opaque pure white paint silhouette with a dense solid interior covering at least 95% of its rectangular body, organic bristle teeth at the leading right edge, slightly rough edges, minimal transparent gaps only near perimeter. Gentle handmade irregularity. One stroke only centered, ample transparent margins.

### 02-dry

Single horizontal dry-brush swipe, wide 4:1 silhouette. Opaque pure white paint, mostly solid core, fine elongated transparent bristle grooves only at the upper and lower edges and right trailing tip. Rough broken fringe with sparse small flecks near edges, not detached large splatters. One stroke centered with transparent margins.

### 03-narrow

Single narrow long horizontal brush underline, very wide 7:1 white paint silhouette, opaque solid interior, gently uneven top and bottom edges, pointed fast flick on the right and rounded loaded-brush start on left. Few small white paint flecks attached near the right tip. One stroke only centered with transparent margins.

### 04-diagonal

Single bold broad paintbrush sweep rising from lower left to upper right at 15 degrees, approximately 4:1 length to thickness, pure white opaque solid interior, strong irregular bristle tip and rough brush edges, slightly curved energetic silhouette, minimal gaps only at perimeter. One brushstroke only centered with generous transparent margins.

Shared constraints: flat 2D white alpha-mask silhouette, true transparent background, no text, no checkerboard, no shadows or tools. Production CSS/SVG reveal texture.

## Motion plan

Paths will be authored in board-local coordinates and transformed with the existing board homography. Flat: large headings; dry: content blocks; narrow: subheadings/underlines; diagonal: keyword emphasis. Animation timing and trajectories are separate from these static textures. End each reveal fully opaque so no text is permanently obscured by transparent texture gaps.
