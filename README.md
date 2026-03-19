# Atlas Dice Dominion

A pass-and-play strategy prototype built around dice-driven actions, a modern world map, and capturable land + sea provinces.

## Play
1. Open `index.html` in a browser.
2. Choose the number of countries and rounds.
3. Each turn, pick **one** action: capture, produce a tank, produce a ship, or rename your country.
4. Roll the dice to resolve the action.

## Key Rules Implemented
- **Capture:** Pick an origin province, then a neighboring target. Capture chance scales with tanks (land) or ships (sea).
- **Dice Results:**
  - `Yes` = action succeeds (subject to capture chance for attacks).
  - `No` = action fails.
  - `Of course` = double production on tanks/ships (not double land).
  - `Lost` (capture only) = you lose a bordering land province.
- **Ships:** Only coastal provinces can build ships, and ships appear at the coast edge.
- **Neutral Provinces:** All neutral (gray) provinces can be captured with no declaration.
- **Newspaper:** Each country can publish a short headline on its turn.
- **Ideology:** Each country can set its ideology any time during its turn.
- **Victory:** Win immediately by controlling all land provinces, or win by most land when rounds end.

## Credits
- World map data: Natural Earth (public domain), delivered via world-atlas.
- Icons: Tabler Icons (MIT).
- Libraries: D3.js and TopoJSON.
