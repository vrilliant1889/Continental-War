const WORLD_URLS = [
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
  "https://unpkg.com/world-atlas@2/countries-110m.json"
];
const ICON_URLS = {
  tank: "https://cdn.jsdelivr.net/npm/@tabler/icons@3.34.0/icons/tank.svg",
  ship: "https://cdn.jsdelivr.net/npm/@tabler/icons@3.34.0/icons/ship.svg"
};

const diceFaces = ["Yes", "No", "Of course", "Lost", "Yes", "No"];

const state = {
  provinces: [],
  seaProvinces: [],
  provinceById: new Map(),
  players: [],
  round: 1,
  maxRounds: 30,
  activeIndex: 0,
  action: null,
  gameOver: false,
  mapReady: false,
  mapLoading: false,
  loadError: null,
  selections: {
    originId: null,
    targetId: null
  },
  lastRoll: null,
  news: [],
  turnLog: []
};

const colors = [
  "#ce6b4d",
  "#4a7d88",
  "#8a5fbf",
  "#c79a3b",
  "#5c8f4f",
  "#d46f92",
  "#2e5aa7",
  "#9a6d4b"
];

const svg = d3.select("#map");
const defs = svg.append("defs");
const root = svg.append("g").attr("class", "map-root");
const seaLayer = root.append("g").attr("class", "sea-layer");
const landLayer = root.append("g").attr("class", "land-layer");
const microLayer = root.append("g").attr("class", "micro-layer");
const unitLayer = root.append("g").attr("class", "unit-layer");

const width = 1200;
const height = 620;
const projection = d3.geoNaturalEarth1().fitSize([width, height], { type: "Sphere" });
const path = d3.geoPath(projection);

const selectionHint = document.getElementById("selection-hint");
const originDisplay = document.getElementById("origin-display");
const targetDisplay = document.getElementById("target-display");
const chanceDisplay = document.getElementById("chance-display");
const diceFace = document.getElementById("dice-face");
const rollBtn = document.getElementById("roll-btn");
const activeCountry = document.getElementById("active-country");
const roundDisplay = document.getElementById("round-display");
const roundMax = document.getElementById("round-max");
const scoreboard = document.getElementById("scoreboard");
const newsFeed = document.getElementById("news-feed");
const newsInput = document.getElementById("news-input");
const newsPublish = document.getElementById("news-publish");
const ideologyInput = document.getElementById("ideology-input");
const ideologySave = document.getElementById("ideology-save");
const turnLog = document.getElementById("turn-log");
const toast = document.getElementById("toast");

const setupOverlay = document.getElementById("setup-overlay");
const passOverlay = document.getElementById("pass-overlay");
const nextPlayerName = document.getElementById("next-player-name");
const nextPlayerBtn = document.getElementById("next-player-btn");
const playerCountInput = document.getElementById("player-count");
const roundCountInput = document.getElementById("round-count");
const playerNamesWrap = document.getElementById("player-names");
const startGameBtn = document.getElementById("start-game");
const setupStatus = document.getElementById("setup-status");
startGameBtn.disabled = false;

const zoom = d3.zoom()
  .scaleExtent([1, 5])
  .on("zoom", (event) => {
    root.attr("transform", event.transform);
  });

svg.call(zoom);

document.getElementById("zoom-in").addEventListener("click", () => {
  svg.transition().call(zoom.scaleBy, 1.2);
});

document.getElementById("zoom-out").addEventListener("click", () => {
  svg.transition().call(zoom.scaleBy, 0.8);
});

document.getElementById("zoom-reset").addEventListener("click", () => {
  svg.transition().call(zoom.transform, d3.zoomIdentity);
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add("hidden"), 2000);
}

function setSetupStatus(message, isError = false) {
  if (!setupStatus) return;
  setupStatus.textContent = message;
  setupStatus.classList.toggle("error", isError);
}

function addLog(message) {
  state.turnLog.unshift({ id: Date.now(), message });
  if (state.turnLog.length > 6) {
    state.turnLog.pop();
  }
  renderLog();
}

function renderLog() {
  turnLog.innerHTML = "";
  state.turnLog.forEach((entry) => {
    const div = document.createElement("div");
    div.textContent = entry.message;
    turnLog.appendChild(div);
  });
}

function updateSetupNames() {
  const count = Number(playerCountInput.value || 2);
  playerNamesWrap.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    const span = document.createElement("span");
    span.textContent = `Country ${i + 1} Name`;
    const input = document.createElement("input");
    input.value = `Country ${i + 1}`;
    input.dataset.playerIndex = i;
    wrapper.appendChild(span);
    wrapper.appendChild(input);
    playerNamesWrap.appendChild(wrapper);
  }
}

playerCountInput.addEventListener("change", updateSetupNames);
updateSetupNames();

function getActivePlayer() {
  return state.players[state.activeIndex];
}

function setAction(action) {
  state.action = action;
  resetSelection();
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.action === action);
  });
  const hints = {
    capture: "Select an origin province, then a neighboring target.",
    tank: "Select a land province you own to produce a tank.",
    ship: "Select a coastal province you own to produce a ship.",
    rename: "Use this to rename your country (ends your turn)."
  };
  selectionHint.textContent = hints[action] || "Pick an action to begin.";
  updateRollButton();
}

function resetSelection() {
  state.selections.originId = null;
  state.selections.targetId = null;
  originDisplay.textContent = "None";
  targetDisplay.textContent = "None";
  chanceDisplay.textContent = "Chance: --";
  updateMapStyles();
  updateRollButton();
}

function updateRollButton() {
  const action = state.action;
  if (state.gameOver || !action) {
    rollBtn.disabled = true;
    return;
  }
  if (action === "rename") {
    rollBtn.disabled = true;
    return;
  }
  if (action === "capture") {
    rollBtn.disabled = !(state.selections.originId && state.selections.targetId);
    return;
  }
  rollBtn.disabled = !state.selections.originId;
}

function updateSelectionUI() {
  const origin = state.provinceById.get(state.selections.originId);
  const target = state.provinceById.get(state.selections.targetId);
  originDisplay.textContent = origin ? origin.name : "None";
  targetDisplay.textContent = target ? target.name : "None";

  if (origin && target && state.action === "capture") {
    const chance = calculateCaptureChance(origin, target);
    chanceDisplay.textContent = `Chance: ${(chance * 100).toFixed(0)}%`;
  } else {
    chanceDisplay.textContent = "Chance: --";
  }
}

function calculateCaptureChance(origin, target) {
  if (target.type === "sea") {
    const ships = origin.ships || 0;
    return Math.min(0.95, Math.max(0.25, 0.35 + ships * 0.2));
  }
  const tanks = origin.tanks || 0;
  return Math.min(0.9, Math.max(0.2, 0.25 + tanks * 0.15));
}

function handleProvinceClick(province) {
  if (state.gameOver) {
    showToast("The game is over. Start a new match to play again.");
    return;
  }
  if (!state.action) {
    setAction("capture");
    showToast("Defaulted to Capture. Select your origin province.");
  }
  const action = state.action;

  const active = getActivePlayer();

  if (action === "rename") {
    showToast("Rename your country in the prompt below.");
    return;
  }

  if (action === "tank") {
    if (province.type !== "land") {
      showToast("Tanks can only be produced on land.");
      return;
    }
    if (province.ownerId !== active.id) {
      showToast("You can only produce in your own province.");
      return;
    }
    state.selections.originId = province.id;
    updateSelectionUI();
    updateRollButton();
    updateMapStyles();
    return;
  }

  if (action === "ship") {
    if (province.type !== "land") {
      showToast("Ships must be produced in coastal land provinces.");
      return;
    }
    if (!province.coastal) {
      showToast("This province has no sea access.");
      return;
    }
    if (province.ownerId !== active.id) {
      showToast("You can only produce in your own province.");
      return;
    }
    state.selections.originId = province.id;
    updateSelectionUI();
    updateRollButton();
    updateMapStyles();
    return;
  }

  if (action === "capture") {
    if (!state.selections.originId) {
      if (province.ownerId !== active.id) {
        showToast("Choose one of your provinces as the origin.");
        return;
      }
      if (province.type === "land" && province.tanks <= 0) {
        showToast("You need at least 1 tank to capture land.");
        return;
      }
      if (province.type === "sea" && province.ships <= 0) {
        showToast("You need at least 1 ship to capture sea.");
        return;
      }
      state.selections.originId = province.id;
      updateSelectionUI();
      updateMapStyles();
      updateRollButton();
      return;
    }

    if (!state.selections.targetId) {
      const origin = state.provinceById.get(state.selections.originId);
      if (!origin.neighbors.includes(province.id)) {
        showToast("Target must border the origin province.");
        return;
      }
      if (province.ownerId === active.id) {
        showToast("That province is already yours.");
        return;
      }
      if (origin.type === "land" && province.type !== "land") {
        if (origin.ships <= 0) {
          showToast("You need ships to capture sea zones.");
          return;
        }
      }
      if (origin.type === "sea" && province.type !== "sea") {
        showToast("Ships can only capture sea provinces.");
        return;
      }
      state.selections.targetId = province.id;
      updateSelectionUI();
      updateMapStyles();
      updateRollButton();
    }
  }
}

function rollDice() {
  const face = diceFaces[Math.floor(Math.random() * diceFaces.length)];
  state.lastRoll = face;
  diceFace.classList.add("rolling");
  diceFace.textContent = face;
  setTimeout(() => diceFace.classList.remove("rolling"), 600);
  return face;
}

function finishTurn() {
  if (state.gameOver) return;
  resetSelection();
  state.lastRoll = null;
  diceFace.textContent = "Ready";

  state.activeIndex = (state.activeIndex + 1) % state.players.length;
  if (state.activeIndex === 0) {
    state.round += 1;
  }

  updateHeader();
  updateScoreboard();
  updateMapStyles();
  updateUnits();
  showPassOverlay();

  if (state.round > state.maxRounds) {
    endGame();
  }
}

function setGameOver(message) {
  state.gameOver = true;
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.disabled = true;
  });
  rollBtn.disabled = true;
  showToast(message);
}

function endGame() {
  const landProvinces = state.provinces.filter((p) => p.type === "land");
  const counts = state.players.map((player) => {
    const owned = landProvinces.filter((p) => p.ownerId === player.id).length;
    return { player, owned };
  });
  counts.sort((a, b) => b.owned - a.owned);
  const winner = counts[0];
  setGameOver(`${winner.player.name} wins by holding ${winner.owned} land provinces!`);
}

function checkVictory() {
  const landProvinces = state.provinces.filter((p) => p.type === "land");
  const activeId = getActivePlayer().id;
  const ownsAll = landProvinces.every((p) => p.ownerId === activeId);
  if (ownsAll) {
    setGameOver(`${getActivePlayer().name} controls every land province!`);
    updateScoreboard();
    updateHeader();
    return true;
  }
  return false;
}

function applyProduction(type) {
  const origin = state.provinceById.get(state.selections.originId);
  if (!origin) return;
  const result = rollDice();

  if (result === "Yes" || result === "Of course") {
    const amount = result === "Of course" ? 2 : 1;
    if (type === "tank") {
      origin.tanks += amount;
      addLog(`${getActivePlayer().name} produced ${amount} tank${amount > 1 ? "s" : ""} in ${origin.name}.`);
    } else {
      origin.ships += amount;
      addLog(`${getActivePlayer().name} produced ${amount} ship${amount > 1 ? "s" : ""} in ${origin.name}.`);
    }
  } else {
    addLog(`${getActivePlayer().name} failed to produce in ${origin.name}.`);
  }

  updateMapStyles();
  updateUnits();
  finishTurn();
}

function applyLost(origin, target) {
  const activeId = getActivePlayer().id;
  const ownedNeighbors = target.neighbors
    .map((id) => state.provinceById.get(id))
    .filter((p) => p && p.ownerId === activeId && p.type === "land");

  let victim = ownedNeighbors[Math.floor(Math.random() * ownedNeighbors.length)];
  if (!victim) {
    const originNeighbors = origin.neighbors
      .map((id) => state.provinceById.get(id))
      .filter((p) => p && p.ownerId === activeId && p.type === "land");
    victim = originNeighbors[Math.floor(Math.random() * originNeighbors.length)];
  }

  if (victim) {
    victim.ownerId = null;
    victim.tanks = 0;
    victim.ships = 0;
    addLog(`${getActivePlayer().name} lost control of ${victim.name}.`);
  } else {
    addLog(`${getActivePlayer().name} got lucky — no bordering province to lose.`);
  }
}

function applyCapture() {
  const origin = state.provinceById.get(state.selections.originId);
  const target = state.provinceById.get(state.selections.targetId);
  if (!origin || !target) return;

  const result = rollDice();

  if (result === "Lost") {
    applyLost(origin, target);
    updateMapStyles();
    updateUnits();
    finishTurn();
    return;
  }

  if (result === "No") {
    addLog(`${getActivePlayer().name} failed to capture ${target.name}.`);
    finishTurn();
    return;
  }

  let chance = calculateCaptureChance(origin, target);

  const roll = Math.random();
  if (roll <= chance) {
    target.ownerId = getActivePlayer().id;
    addLog(`${getActivePlayer().name} captured ${target.name}!`);
    updateMapStyles();
    updateUnits();
    if (checkVictory()) {
      return;
    }
  } else {
    addLog(`${getActivePlayer().name} failed the capture roll for ${target.name}.`);
  }

  finishTurn();
}

function updateHeader() {
  roundDisplay.textContent = state.round;
  roundMax.textContent = state.maxRounds;
  const active = getActivePlayer();
  activeCountry.textContent = active?.name || "-";
  activeCountry.style.color = active?.color || "inherit";
}

function updateScoreboard() {
  scoreboard.innerHTML = "";
  const landProvinces = state.provinces.filter((p) => p.type === "land");
  state.players.forEach((player) => {
    const card = document.createElement("div");
    card.className = "score-card";
    const name = document.createElement("div");
    name.className = "name";
    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = player.color;
    name.style.color = player.color;
    card.style.borderLeft = `6px solid ${player.color}`;
    name.appendChild(dot);
    name.appendChild(document.createTextNode(player.name));

    const landCount = landProvinces.filter((p) => p.ownerId === player.id).length;
    const tanks = state.provinces.reduce((sum, p) => sum + (p.ownerId === player.id ? p.tanks : 0), 0);
    const ships = state.provinces.reduce((sum, p) => sum + (p.ownerId === player.id ? p.ships : 0), 0);

    const stats = document.createElement("div");
    stats.textContent = `Land: ${landCount} | Tanks: ${tanks} | Ships: ${ships}`;

    const ideology = document.createElement("div");
    ideology.className = "muted";
    ideology.textContent = `Ideology: ${player.ideology || "Unwritten"}`;

    card.appendChild(name);
    card.appendChild(stats);
    card.appendChild(ideology);
    scoreboard.appendChild(card);
  });
}

function updateNewsFeed() {
  newsFeed.innerHTML = "";
  state.news.slice().reverse().forEach((entry) => {
    const item = document.createElement("div");
    item.className = "news-item";
    item.innerHTML = `<strong>${entry.country}</strong> (Round ${entry.round}): ${entry.text}`;
    newsFeed.appendChild(item);
  });
}

function showPassOverlay() {
  nextPlayerName.textContent = getActivePlayer().name;
  passOverlay.classList.remove("hidden");
}

nextPlayerBtn.addEventListener("click", () => {
  passOverlay.classList.add("hidden");
  addLog(`${getActivePlayer().name}'s turn begins.`);
});

newsPublish.addEventListener("click", () => {
  const text = newsInput.value.trim();
  if (!text) {
    showToast("Write a short headline first.");
    return;
  }
  state.news.push({
    country: getActivePlayer().name,
    round: state.round,
    text
  });
  newsInput.value = "";
  updateNewsFeed();
  showToast("Headline published.");
});

ideologySave.addEventListener("click", () => {
  const value = ideologyInput.value.trim();
  if (!value) {
    showToast("Enter an ideology first.");
    return;
  }
  getActivePlayer().ideology = value;
  ideologyInput.value = "";
  updateScoreboard();
  showToast("Ideology updated.");
});

rollBtn.addEventListener("click", () => {
  if (state.gameOver) return;
  if (state.action === "tank") {
    applyProduction("tank");
  } else if (state.action === "ship") {
    applyProduction("ship");
  } else if (state.action === "capture") {
    applyCapture();
  }
});

function updateMapStyles() {
  landLayer.selectAll("path").classed("selected", (d) => d.id === state.selections.targetId || d.id === state.selections.originId);
  landLayer.selectAll("path").classed("origin", (d) => d.id === state.selections.originId);
  seaLayer.selectAll("path").classed("selected", (d) => d.id === state.selections.targetId || d.id === state.selections.originId);
  seaLayer.selectAll("path").classed("origin", (d) => d.id === state.selections.originId);

  landLayer.selectAll("path").style("fill", (d) => {
    const province = state.provinceById.get(d.id);
    if (!province || !province.ownerId) return "#c1beb4";
    return state.players.find((p) => p.id === province.ownerId)?.color || "#e7e1d4";
  });

  microLayer.selectAll("path").style("fill", (d) => {
    const province = state.provinceById.get(d.parentId);
    if (!province || !province.ownerId) return "#c1beb4";
    return state.players.find((p) => p.id === province.ownerId)?.color || "#e7e1d4";
  });

  seaLayer.selectAll("path").style("fill", (d) => {
    const province = state.provinceById.get(d.id);
    if (!province || !province.ownerId) return "#8dbec7";
    const color = state.players.find((p) => p.id === province.ownerId)?.color || "#8dbec7";
    const seaColor = d3.color(color);
    if (seaColor) {
      seaColor.opacity = 0.55;
      return seaColor.toString();
    }
    return color;
  });
}

function updateUnits() {
  const units = [];
  state.provinces.forEach((province) => {
    if (province.tanks > 0) {
      units.push({
        id: `${province.id}-tank`,
        type: "tank",
        count: province.tanks,
        x: province.centroid[0] - 8,
        y: province.centroid[1] - 8,
        color: state.players.find((p) => p.id === province.ownerId)?.color || "#333"
      });
    }
    if (province.ships > 0) {
      const anchor = province.type === "land" ? province.shipAnchor || province.centroid : province.centroid;
      units.push({
        id: `${province.id}-ship`,
        type: "ship",
        count: province.ships,
        x: anchor[0] + 6,
        y: anchor[1] - 8,
        color: state.players.find((p) => p.id === province.ownerId)?.color || "#333"
      });
    }
  });

  const unitSel = unitLayer.selectAll("g.unit-icon").data(units, (d) => d.id);

  const unitEnter = unitSel.enter().append("g").attr("class", "unit-icon");
  unitEnter.append("use");
  unitEnter.append("text")
    .attr("text-anchor", "start")
    .attr("dx", 18)
    .attr("dy", 14)
    .style("font-size", "11px")
    .style("font-weight", "700");

  unitSel.merge(unitEnter)
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .each(function (d) {
      const group = d3.select(this);
      group.select("use")
        .attr("href", `#icon-${d.type}`)
        .attr("width", 18)
        .attr("height", 18)
        .attr("fill", "none")
        .attr("stroke", d.color)
        .attr("stroke-width", 1.8);
      group.select("text")
        .attr("fill", d.color)
        .text(d.count);
    });

  unitSel.exit().remove();
}

function createSeaGrid(landFeature) {
  const seaCols = 18;
  const seaRows = 9;
  const lonStep = 360 / seaCols;
  const latMin = -60;
  const latMax = 80;
  const latStep = (latMax - latMin) / seaRows;
  const sea = [];

  let index = 0;
  for (let row = 0; row < seaRows; row += 1) {
    for (let col = 0; col < seaCols; col += 1) {
      const lon0 = -180 + col * lonStep;
      const lon1 = lon0 + lonStep;
      const lat1 = latMax - row * latStep;
      const lat0 = lat1 - latStep;
      const center = [(lon0 + lon1) / 2, (lat0 + lat1) / 2];
      if (d3.geoContains(landFeature, center)) {
        continue;
      }
      sea.push({
        id: `sea-${index}`,
        name: `Sea Zone ${index + 1}`,
        type: "sea",
        polygon: {
          type: "Polygon",
          coordinates: [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]]
        },
        center,
        neighbors: [],
        ownerId: null,
        tanks: 0,
        ships: 0
      });
      index += 1;
    }
  }

  sea.forEach((cell) => {
    const [lon, lat] = cell.center;
    sea.forEach((other) => {
      if (cell.id === other.id) return;
      const [olon, olat] = other.center;
      const adjacent = (Math.abs(lon - olon) <= lonStep + 0.01 && Math.abs(lat - olat) <= 0.01)
        || (Math.abs(lat - olat) <= latStep + 0.01 && Math.abs(lon - olon) <= 0.01);
      if (adjacent) {
        cell.neighbors.push(other.id);
      }
    });
  });

  return sea;
}

function enrichCoastalData(landProvinces, seaProvinces) {
  const distanceLimit = 0.25; // radians
  landProvinces.forEach((province) => {
    const bounds = d3.geoBounds(province.feature);
    const boundaryPoints = sampleBoundaryPoints(province.feature);
    let nearest = null;
    let nearestDistance = Infinity;

    seaProvinces.forEach((sea) => {
      const center = sea.center;
      const insideBounds = center[0] >= bounds[0][0] - 2
        && center[0] <= bounds[1][0] + 2
        && center[1] >= bounds[0][1] - 2
        && center[1] <= bounds[1][1] + 2;
      if (!insideBounds) return;

      const close = boundaryPoints.some((point) => d3.geoDistance(point, center) < distanceLimit);
      if (!close) return;

      province.neighbors.push(sea.id);
      sea.neighbors.push(province.id);
      province.coastal = true;

      const dist = d3.geoDistance(province.geoCentroid, center);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearest = center;
      }
    });

    if (nearest) {
      const screenCenter = projection(nearest);
      province.shipAnchor = [
        (province.centroid[0] * 0.6 + screenCenter[0] * 0.4),
        (province.centroid[1] * 0.6 + screenCenter[1] * 0.4)
      ];
    }
  });
}

function sampleBoundaryPoints(feature) {
  const points = [];
  const coords = feature.geometry.type === "MultiPolygon"
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];

  coords.forEach((polygon) => {
    polygon.forEach((ring) => {
      for (let i = 0; i < ring.length; i += 6) {
        points.push(ring[i]);
      }
    });
  });

  return points;
}

function buildGame(world) {
  const countries = topojson.feature(world, world.objects.countries).features;
  const areas = countries.map((feature) => d3.geoArea(feature)).sort(d3.ascending);
  const areaThreshold = Math.max(0.00008, d3.quantile(areas, 0.18));

  const neighbors = topojson.neighbors(world.objects.countries.geometries);

  const provinceList = [];
  let microList = [];

  countries.forEach((feature, index) => {
    const area = d3.geoArea(feature);
    const isMicro = area < areaThreshold;
    const id = `land-${feature.id}`;
    const name = feature.properties?.name || `Province ${index + 1}`;
    const centroid = path.centroid(feature);
    const geoCentroid = d3.geoCentroid(feature);

    const province = {
      id,
      name,
      type: "land",
      feature,
      area,
      centroid,
      geoCentroid,
      neighbors: [],
      ownerId: null,
      tanks: 0,
      ships: 0,
      coastal: false,
      shipAnchor: null
    };

    if (isMicro) {
      province.isMicro = true;
      province.neighborIndexes = neighbors[index];
      microList.push(province);
    } else {
      province.neighborIndexes = neighbors[index];
      provinceList.push(province);
    }
  });

  const provinceByIndex = new Map();
  provinceList.forEach((province) => {
    provinceByIndex.set(province.feature.id, province);
  });

  const mergedMicros = [];
  microList.forEach((micro) => {
    let best = null;
    let bestArea = 0;
    micro.neighborIndexes.forEach((neighborIndex) => {
      const neighborFeature = countries[neighborIndex];
      const candidate = provinceByIndex.get(neighborFeature.id);
      if (candidate && candidate.area > bestArea) {
        bestArea = candidate.area;
        best = candidate;
      }
    });
    if (best) {
      micro.parentId = best.id;
      mergedMicros.push(micro);
    } else {
      micro.isMicro = false;
      provinceList.push(micro);
      provinceByIndex.set(micro.feature.id, micro);
    }
  });
  microList = mergedMicros;

  provinceList.forEach((province) => {
    const neighborIdx = province.neighborIndexes || [];
    neighborIdx.forEach((neighborIndex) => {
      const neighborFeature = countries[neighborIndex];
      const neighborProvince = provinceByIndex.get(neighborFeature.id);
      if (neighborProvince && neighborProvince.id !== province.id) {
        province.neighbors.push(neighborProvince.id);
      }
    });
  });

  const landFeature = world.objects.land
    ? topojson.feature(world, world.objects.land)
    : topojson.merge(world, world.objects.countries.geometries);

  const seaProvinces = createSeaGrid(landFeature);
  enrichCoastalData(provinceList, seaProvinces);

  state.provinces = [...provinceList, ...seaProvinces];
  state.seaProvinces = seaProvinces;
  state.provinceById = new Map(state.provinces.map((p) => [p.id, p]));

  renderMap(provinceList, microList, seaProvinces);
}

function renderMap(landProvinces, microList, seaProvinces) {
  seaLayer.selectAll("path")
    .data(seaProvinces, (d) => d.id)
    .enter()
    .append("path")
    .attr("class", "province sea")
    .attr("d", (d) => path(d.polygon))
    .on("click", (_, d) => handleProvinceClick(d));

  landLayer.selectAll("path")
    .data(landProvinces, (d) => d.id)
    .enter()
    .append("path")
    .attr("class", "province land")
    .attr("d", (d) => path(d.feature))
    .on("click", (_, d) => handleProvinceClick(d));

  microLayer.selectAll("path")
    .data(microList, (d) => d.id)
    .enter()
    .append("path")
    .attr("class", "province land")
    .attr("d", (d) => path(d.feature))
    .style("pointer-events", "none")
    .each(function (d) {
      d3.select(this).datum({ id: d.id, parentId: d.parentId });
    });

  updateMapStyles();
}

function assignStartingProvinces() {
  const landProvinces = state.provinces.filter((p) => p.type === "land");
  landProvinces.forEach((province) => {
    province.ownerId = null;
    province.tanks = 0;
    province.ships = 0;
  });

  const shuffled = [...landProvinces].sort(() => Math.random() - 0.5);
  const required = state.players.length * 2;
  const perPlayer = shuffled.length >= required ? 2 : Math.max(1, Math.floor(shuffled.length / state.players.length));
  let cursor = 0;

  state.players.forEach((player) => {
    for (let i = 0; i < perPlayer; i += 1) {
      const province = shuffled[cursor];
      cursor += 1;
      if (!province) return;
      province.ownerId = player.id;
      province.tanks = Math.max(province.tanks, 1);
    }
  });

  if (perPlayer < 2) {
    showToast("Not enough land provinces for 2 starts each. Assigned fewer instead.");
  }
}

function initPlayers() {
  const count = Number(playerCountInput.value || 2);
  const names = Array.from(playerNamesWrap.querySelectorAll("input")).map((input, index) => {
    return input.value.trim() || `Country ${index + 1}`;
  });

  state.players = names.slice(0, count).map((name, index) => ({
    id: `player-${index}`,
    name,
    color: colors[index % colors.length],
    ideology: "",
    isActive: index === 0
  }));
}

function initGame() {
  state.round = 1;
  state.activeIndex = 0;
  state.maxRounds = Number(roundCountInput.value || 30);
  state.turnLog = [];
  state.news = [];
  state.gameOver = false;
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.disabled = false;
  });
  rollBtn.disabled = true;
  assignStartingProvinces();
  setAction("capture");
  updateMapStyles();
  updateUnits();
  updateHeader();
  updateScoreboard();
  updateNewsFeed();
  updateUnits();
  addLog(`${getActivePlayer().name}'s turn begins.`);
}

startGameBtn.addEventListener("click", () => {
  if (!state.mapReady) {
    if (state.mapLoading) {
      showToast("Map is still loading. Please wait a moment.");
    } else {
      showToast("Map failed to load. Open via a local server and refresh.");
    }
    return;
  }
  initPlayers();
  initGame();
  setupOverlay.classList.add("hidden");
});

function handleRename() {
  const name = prompt("Enter the new country name:");
  if (!name) return;
  getActivePlayer().name = name.trim();
  updateHeader();
  updateScoreboard();
  addLog(`Country renamed to ${name.trim()}.`);
  finishTurn();
}

document.querySelectorAll(".action-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    setAction(action);
    if (action === "rename") {
      handleRename();
    }
  });
});

async function fetchWithFallback(urls, parser) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`);
      }
      const text = await response.text();
      return parser(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All map sources failed.");
}

async function loadWorldData() {
  const world = await fetchWithFallback(WORLD_URLS, (text) => JSON.parse(text));
  return { world };
}

async function loadIcons() {
  const parser = new DOMParser();
  const entries = Object.entries(ICON_URLS);
  for (const [key, url] of entries) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const svgEl = doc.querySelector("svg");
      if (!svgEl) continue;
      const symbol = document.createElementNS("http://www.w3.org/2000/svg", "symbol");
      symbol.setAttribute("id", `icon-${key}`);
      symbol.setAttribute("viewBox", svgEl.getAttribute("viewBox") || "0 0 24 24");
      svgEl.querySelectorAll("path, line, polyline, polygon, rect, circle").forEach((node) => {
        symbol.appendChild(node.cloneNode(true));
      });
      defs.node().appendChild(symbol);
    } catch (error) {
      console.error("Icon load failed", error);
    }
  }
}

async function init() {
  state.mapLoading = true;
  state.mapReady = false;
  state.loadError = null;
  setSetupStatus("Loading map data...");
  try {
    await loadIcons();
    const { world } = await loadWorldData();
    buildGame(world);
    state.mapReady = true;
    setSetupStatus("Map ready. Start your game.");
  } catch (error) {
    console.error(error);
    state.loadError = error;
    setSetupStatus("Map failed to load. If you opened the file directly, run a local server and refresh.", true);
  } finally {
    state.mapLoading = false;
  }
}

init();



