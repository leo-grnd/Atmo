// app.js — ATMO : qualité de l'air, UV & pollen en temps réel.
// Vanilla ES module, zéro dépendance. Données : Open-Meteo (sans clé).
import {
  aqiBand, uvBand, UV_ADVICE,
  POLLUTANTS, POLLENS, POLLEN_SCALE_MAX, pollenLevel,
  windDispersion, WIND_DIRS, HISTORY_HOURS, TREND_DELTA, TREND,
  ADVICE,
} from "./config.js";

const AQ_API = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WX_API = "https://api.open-meteo.com/v1/forecast";
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const REV_API = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const PROXY = "https://corsproxy.io/?url="; // repli si l'appel direct est bloqué (CORS)

const CACHE_KEY = "atmo-cache-v2";
const LOC_KEY = "atmo-loc";
const THEME_KEY = "atmo-theme";
const CACHE_TTL = 60 * 60 * 1000; // 1 h

const CURRENT_VARS = [
  "european_aqi", "uv_index",
  "pm2_5", "pm10", "nitrogen_dioxide", "ozone", "sulphur_dioxide", "carbon_monoxide",
  "european_aqi_pm2_5", "european_aqi_pm10", "european_aqi_nitrogen_dioxide",
  "european_aqi_ozone", "european_aqi_sulphur_dioxide",
];
const HOURLY_VARS = [
  "european_aqi", "uv_index",
  ...POLLENS.map((p) => p.key),
];

// --- helpers DOM & format --------------------------------------------------
const $ = (id) => document.getElementById(id);
const round = (v, d = 0) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const fmtNum = (v, d = 0) => (v == null || Number.isNaN(v) ? "—" : round(v, d).toLocaleString("fr-FR"));

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function frDay(date) { return DAY_FMT.format(date); }

// --- récupération données (direct, repli proxy) ----------------------------
async function getJSON(url) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (_) {
    const r = await fetch(PROXY + encodeURIComponent(url));
    if (!r.ok) throw new Error(`proxy ${r.status}`);
    return await r.json();
  }
}

function fetchAir(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "auto",
    forecast_days: "3",
    past_days: "2", // pour la tendance des dernières 48 h
    current: CURRENT_VARS.join(","),
    hourly: HOURLY_VARS.join(","),
  });
  return getJSON(`${AQ_API}?${params.toString()}`);
}

function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: "auto",
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m",
  });
  return getJSON(`${WX_API}?${params.toString()}`);
}

async function geocode(name) {
  const params = new URLSearchParams({ name, count: "5", language: "fr", format: "json" });
  const data = await getJSON(`${GEO_API}?${params.toString()}`);
  return data?.results || [];
}

async function reverseGeocode(lat, lon) {
  // Optionnel : nom de ville depuis des coordonnées. Échec → on retombe sur les coords.
  try {
    const params = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: "fr" });
    const d = await getJSON(`${REV_API}?${params.toString()}`);
    const name = d.city || d.locality || d.principalSubdivision;
    if (name) return { name, admin1: d.principalSubdivision || "", country: d.countryName || "" };
  } catch (_) {}
  return null;
}

// --- cache & localisation (localStorage) -----------------------------------
function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (_) { return null; } }
function saveCache(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (_) {} }
function loadLoc() { try { return JSON.parse(localStorage.getItem(LOC_KEY) || "null"); } catch (_) { return null; } }
function saveLoc(l) { try { localStorage.setItem(LOC_KEY, JSON.stringify(l)); } catch (_) {} }

// --- permalien (?lat&lon&name) ---------------------------------------------
function parseLocFromURL() {
  const p = new URLSearchParams(location.search);
  const lat = parseFloat(p.get("lat"));
  const lon = parseFloat(p.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return {
    coords: { lat, lon },
    place: { name: p.get("name") || "", admin1: p.get("admin1") || "", country: p.get("country") || "" },
  };
}

function updateURL(loc) {
  try {
    const p = new URLSearchParams();
    p.set("lat", loc.coords.lat.toFixed(4));
    p.set("lon", loc.coords.lon.toFixed(4));
    if (loc.place?.name) p.set("name", loc.place.name);
    if (loc.place?.admin1) p.set("admin1", loc.place.admin1);
    if (loc.place?.country) p.set("country", loc.place.country);
    history.replaceState(null, "", `?${p.toString()}`);
  } catch (_) {}
}

// --- index de l'heure courante dans les séries horaires --------------------
function nowIndex(air) {
  const times = air?.hourly?.time;
  if (!times || !times.length) return 0;
  const cur = air?.current?.time;
  if (cur) {
    const key = cur.slice(0, 13); // "YYYY-MM-DDTHH"
    const i = times.findIndex((t) => t.slice(0, 13) === key);
    if (i >= 0) return i;
  }
  return 0;
}

// --- rendu : localisation ---------------------------------------------------
function renderPlace(place, coords) {
  if (place?.name) {
    $("place-name").textContent = place.name;
    const sub = [place.admin1, place.country].filter(Boolean).join(" · ");
    $("place-sub").textContent = sub;
  } else if (coords) {
    $("place-name").textContent = "Ma position";
    $("place-sub").textContent = `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`;
  }
}

// --- rendu : AQI ------------------------------------------------------------
function renderAqi(air) {
  const v = air?.current?.european_aqi;
  const band = aqiBand(v);
  $("aqi-card").dataset.band = band.id;
  $("aqi-value").textContent = v == null ? "—" : fmtNum(v);
  $("aqi-grade").textContent = band.label;

  const dom = dominantPollutant(air);
  $("aqi-dominant").innerHTML = dom
    ? `Polluant dominant : <b>${dom.label}</b> — ${dom.name.toLowerCase()}`
    : "Indice européen de qualité de l'air (EAQI).";
}

function dominantPollutant(air) {
  const cur = air?.current;
  if (!cur) return null;
  let best = null, bestVal = -Infinity;
  for (const p of POLLUTANTS) {
    if (!p.subIndex) continue;
    const s = cur[p.subIndex];
    if (s == null || Number.isNaN(s)) continue;
    if (s > bestVal) { bestVal = s; best = p; }
  }
  return best;
}

// --- rendu : UV -------------------------------------------------------------
function renderUv(air) {
  const v = air?.current?.uv_index;
  const band = uvBand(v);
  $("uv-card").dataset.level = band.id;
  $("uv-value").textContent = v == null ? "—" : fmtNum(v, 1);
  $("uv-grade").textContent = band.label;

  const peak = uvPeakToday(air);
  $("uv-peak").innerHTML = peak
    ? `Pic du jour : <b>${fmtNum(peak.value, 1)}</b> vers ${peak.hour} h`
    : "Indice UV — exposition au soleil.";
}

function uvPeakToday(air) {
  const h = air?.hourly;
  if (!h?.time || !h.uv_index) return null;
  const today = (air?.current?.time || h.time[0]).slice(0, 10);
  let best = null;
  for (let i = 0; i < h.time.length; i++) {
    if (h.time[i].slice(0, 10) !== today) continue;
    const val = h.uv_index[i];
    if (val == null) continue;
    if (!best || val > best.value) best = { value: val, hour: Number(h.time[i].slice(11, 13)) };
  }
  return best && best.value > 0 ? best : null;
}

// --- rendu : conseil santé --------------------------------------------------
function renderAdvice(air) {
  const v = air?.current?.european_aqi;
  const band = aqiBand(v);
  const a = ADVICE[band.id] || ADVICE.inconnu;
  $("advice-card").dataset.level = a.level;
  $("advice-title").textContent = a.title;
  $("advice-detail").textContent = a.detail;

  const uv = uvBand(air?.current?.uv_index);
  const uvEl = $("advice-uv");
  if (uv.id === "high" || uv.id === "vhigh" || uv.id === "ext") {
    uvEl.hidden = false;
    uvEl.textContent = `☀ UV ${uv.label.toLowerCase()} — ${UV_ADVICE[uv.id]}`;
  } else {
    uvEl.hidden = true;
  }
}

// --- rendu : détail des polluants ------------------------------------------
function renderPollutants(air) {
  const cur = air?.current || {};
  const tbody = $("poll-body");
  tbody.innerHTML = "";
  const dom = dominantPollutant(air);

  for (const p of POLLUTANTS) {
    const conc = cur[p.key];
    const sub = p.subIndex ? cur[p.subIndex] : null;
    const band = p.subIndex ? aqiBand(sub) : null;
    const tr = document.createElement("tr");
    if (dom && p.key === dom.key) tr.className = "is-dominant";
    const bandCell = band
      ? `<span class="band-tag"><span class="swatch" data-band="${band.id}" aria-hidden="true"></span>${band.label}</span>`
      : "—";
    tr.innerHTML = `
      <th scope="row">${p.label}<span class="sub">${p.name}</span></th>
      <td>${fmtNum(conc, 1)} <span style="color:var(--ink-dim)">${p.unit}</span></td>
      <td class="col-band">${bandCell}</td>`;
    tbody.appendChild(tr);
  }
}

// --- rendu : pollens --------------------------------------------------------
function renderPollen(air) {
  const h = air?.hourly;
  const idx = nowIndex(air);
  const card = $("pollen-card");
  const list = $("pollen-list");
  list.innerHTML = "";

  const rows = [];
  for (const p of POLLENS) {
    const series = h?.[p.key];
    if (!series) continue;
    const val = series[idx] ?? series.find((x) => x != null);
    if (val == null) continue;
    rows.push({ p, val });
  }

  if (!rows.length) { card.hidden = true; return; }
  card.hidden = false;

  // Plus fort risque en premier.
  rows.sort((a, b) => b.val - a.val);
  for (const { p, val } of rows) {
    const lvl = pollenLevel(val);
    const pct = Math.min(100, (val / POLLEN_SCALE_MAX) * 100);
    const row = document.createElement("div");
    row.className = "pollen-row";
    row.dataset.level = lvl?.id || "low";
    row.innerHTML = `
      <div class="pollen-head">
        <span class="pollen-name">${p.label}</span>
        <span class="pollen-level">${lvl?.label || "—"}</span>
      </div>
      <div class="pollen-bar"><span style="width:${pct}%"></span></div>
      <div class="pollen-count">${fmtNum(val)} grains/m³</div>`;
    list.appendChild(row);
  }
}

// --- rendu : prévision (heatmap horaire) -----------------------------------
function renderForecast(air) {
  const h = air?.hourly;
  const wrap = $("forecast");
  wrap.innerHTML = "";
  if (!h?.time || !h.european_aqi) return;

  const curKey = (air?.current?.time || h.time[0]).slice(0, 13);

  // Regroupe les heures par jour calendaire.
  const days = new Map(); // dateISO -> Array(24)
  for (let i = 0; i < h.time.length; i++) {
    const date = h.time[i].slice(0, 10);
    const hour = Number(h.time[i].slice(11, 13));
    if (!days.has(date)) days.set(date, new Array(24).fill(null));
    days.get(date)[hour] = { aqi: h.european_aqi[i], now: h.time[i].slice(0, 13) === curKey };
  }

  const todayISO = (air?.current?.time || h.time[0]).slice(0, 10);
  for (const [date, hours] of days) {
    if (date < todayISO) continue; // on n'affiche que le jour courant + le futur
    const row = document.createElement("div");
    row.className = "fc-row";
    const label = date === todayISO ? "Auj." : frDay(parseISO(date)).split(" ").slice(0, 2).join(" ");
    const cells = hours.map((cell, hr) => {
      const band = aqiBand(cell?.aqi);
      const isNow = cell?.now ? " is-now" : "";
      const title = `${frDay(parseISO(date))} ${String(hr).padStart(2, "0")} h — ${cell?.aqi == null ? "n/d" : `${Math.round(cell.aqi)} (${band.label})`}`;
      return `<span class="fc-cell${isNow}" data-band="${band.id}" title="${title}"></span>`;
    }).join("");
    row.innerHTML = `<span class="fc-day">${date === todayISO ? "Auj." : label}</span><div class="fc-hours">${cells}</div>`;
    wrap.appendChild(row);
  }
}

function parseISO(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }

// --- rendu : conditions météo & vent ---------------------------------------
function cardinal(deg) {
  if (deg == null || Number.isNaN(deg)) return "";
  return WIND_DIRS[Math.round(deg / 45) % 8];
}

function renderWeather(wx) {
  const card = $("weather-card");
  const cur = wx?.current;
  if (!cur || cur.temperature_2m == null) { card.hidden = true; return; }
  card.hidden = false;

  $("wx-temp").textContent = `${fmtNum(cur.temperature_2m, 1)} °C`;
  $("wx-feels").textContent = `${fmtNum(cur.apparent_temperature, 1)} °C`;
  $("wx-hum").textContent = `${fmtNum(cur.relative_humidity_2m)} %`;

  const wind = cur.wind_speed_10m;
  const dir = cardinal(cur.wind_direction_10m);
  $("wx-wind").innerHTML = wind == null
    ? "—"
    : `${fmtNum(wind)} km/h ${dir ? `<span class="wind-arrow" title="${dir}">${dir}</span>` : ""}`;

  const disp = windDispersion(wind);
  $("wx-note").textContent = disp ? disp.note : "";
}

// --- rendu : tendance des 48 h (sparkline) ---------------------------------
function renderHistory(air) {
  const h = air?.hourly;
  const wrap = $("history-spark");
  if (!h?.time || !h.european_aqi) { $("history-card").hidden = true; return; }
  $("history-card").hidden = false;

  const idx = nowIndex(air);
  const start = Math.max(0, idx - (HISTORY_HOURS - 1));
  const pts = [];
  for (let i = start; i <= idx; i++) {
    pts.push({ aqi: h.european_aqi[i], now: i === idx });
  }

  // Verdict : AQI courant vs ~24 h plus tôt.
  const cur = h.european_aqi[idx];
  const prevIdx = idx - 24 >= 0 ? idx - 24 : start;
  const prev = h.european_aqi[prevIdx];
  let tr = TREND.flat;
  if (cur != null && prev != null) {
    const delta = cur - prev;
    tr = delta <= -TREND_DELTA ? TREND.down : delta >= TREND_DELTA ? TREND.up : TREND.flat;
  }
  const verdict = $("history-verdict");
  verdict.dataset.trend = tr.id;
  verdict.innerHTML = `<span class="arrow" aria-hidden="true">${tr.arrow}</span>${tr.label}`;

  // Sparkline : barres horaires colorées par bande, hauteur ∝ indice (plafond 120).
  const W = 480, H = 72, CAP = 120;
  const n = pts.length || 1;
  const bw = W / n;
  let bars = "";
  pts.forEach((p, i) => {
    const v = p.aqi == null ? 0 : Math.min(p.aqi, CAP);
    const bh = p.aqi == null ? 2 : Math.max(2, (v / CAP) * H);
    const x = i * bw;
    const band = aqiBand(p.aqi);
    const cls = p.now ? "spark-bar spark-now" : "spark-bar";
    bars += `<rect class="${cls}" data-band="${band.id}" x="${x.toFixed(2)}" y="${(H - bh).toFixed(2)}" width="${Math.max(1, bw - 0.6).toFixed(2)}" height="${bh.toFixed(2)}"></rect>`;
  });
  wrap.innerHTML = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${bars}</svg>`;
  $("hist-start").textContent = `−${Math.min(HISTORY_HOURS, pts.length - 1)} h`;
}

// --- thème ------------------------------------------------------------------
function setupTheme() {
  const icon = $("themeIcon");
  const apply = (t) => {
    if (t === "light") { document.documentElement.setAttribute("data-theme", "light"); icon.textContent = "☀"; }
    else { document.documentElement.removeAttribute("data-theme"); icon.textContent = "☾"; }
  };
  apply(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  $("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  });
}

// --- statut -----------------------------------------------------------------
function setStatus(state) {
  const el = $("status");
  if (!el) return;
  el.dataset.state = state;
  el.innerHTML = '<span class="pulse" aria-hidden="true"></span>' + (
    state === "live" ? "Open-Meteo · en direct"
    : state === "cache" ? "données en cache"
    : "hors ligne"
  );
}

// --- orchestration ----------------------------------------------------------
let current = null; // { air, place, coords, savedAt }

function renderAll(data) {
  current = data;
  renderPlace(data.place, data.coords);
  renderAqi(data.air);
  renderUv(data.air);
  renderWeather(data.weather);
  renderAdvice(data.air);
  renderPollutants(data.air);
  renderPollen(data.air);
  renderHistory(data.air);
  renderForecast(data.air);
  $("updated").textContent = new Date(data.savedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

// Rafraîchit les éléments horaires (UV du moment, repère « maintenant »).
function tick() {
  if (!current?.air) return;
  renderUv(current.air);
  renderForecast(current.air);
}

async function refresh(loc) {
  try {
    const [air, weather] = await Promise.all([
      fetchAir(loc.coords.lat, loc.coords.lon),
      fetchWeather(loc.coords.lat, loc.coords.lon).catch(() => null),
    ]);
    const data = { air, weather, place: loc.place, coords: loc.coords, savedAt: Date.now() };
    saveCache(data);
    renderAll(data);
    setStatus("live");
  } catch (err) {
    if (current?.air) { setStatus("cache"); }
    else {
      $("advice-card").dataset.level = "neutre";
      $("advice-title").textContent = "Données indisponibles";
      $("advice-detail").textContent = "Vérifiez votre connexion puis réessayez.";
      setStatus("error");
    }
    console.warn("ATMO : échec de récupération", err);
  }
}

function setLocation(coords, place) {
  const loc = { coords, place };
  saveLoc(loc);
  updateURL(loc);
  $("share-btn").hidden = false;
  renderPlace(place, coords);
  refresh(loc);
}

function setupShare() {
  const btn = $("share-btn");
  btn.addEventListener("click", async () => {
    const url = location.href;
    const title = "ATMO — Qualité de l'air";
    const text = current?.place?.name ? `Qualité de l'air à ${current.place.name}` : title;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (_) {}
    }
    try {
      await navigator.clipboard.writeText(url);
      const old = btn.textContent;
      btn.textContent = "✓ Lien copié";
      setTimeout(() => { btn.textContent = old; }, 1600);
    } catch (_) {}
  });
}

// --- contrôles de localisation ---------------------------------------------
function setupLocationControls() {
  const geoBtn = $("geo-btn");
  geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { geoBtn.textContent = "📍 Indisponible"; return; }
    geoBtn.disabled = true;
    geoBtn.textContent = "📍 Localisation…";
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        const place = await reverseGeocode(coords.lat, coords.lon);
        setLocation(coords, place);
        geoBtn.disabled = false;
        geoBtn.textContent = "📍 Ma position";
      },
      () => {
        geoBtn.disabled = false;
        geoBtn.textContent = "📍 Refusé — cherchez une ville";
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });

  const input = $("search-input");
  const results = $("search-results");
  let timer = null;

  const closeResults = () => { results.hidden = true; results.innerHTML = ""; };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { closeResults(); return; }
    timer = setTimeout(async () => {
      let list = [];
      try { list = await geocode(q); } catch (_) {}
      results.innerHTML = "";
      if (!list.length) { closeResults(); return; }
      for (const r of list) {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        const sub = [r.admin1, r.country].filter(Boolean).join(", ");
        li.innerHTML = `${r.name}<span class="sr-sub"> — ${sub}</span>`;
        li.addEventListener("click", () => {
          input.value = r.name;
          closeResults();
          setLocation({ lat: r.latitude, lon: r.longitude }, { name: r.name, admin1: r.admin1, country: r.country });
        });
        results.appendChild(li);
      }
      results.hidden = false;
    }, 300);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) closeResults();
  });
}

// --- démarrage --------------------------------------------------------------
function init() {
  setupTheme();
  setupLocationControls();
  setupShare();

  const urlLoc = parseLocFromURL();
  const loc = urlLoc || loadLoc();
  if (urlLoc) saveLoc(urlLoc);

  const cached = loadCache();
  if (cached?.air && loc && cached.coords?.lat === loc.coords?.lat && cached.coords?.lon === loc.coords?.lon) {
    renderAll(cached);
    setStatus("cache");
  } else if (loc) {
    renderPlace(loc.place, loc.coords);
  }

  if (loc) {
    $("share-btn").hidden = false;
    updateURL(loc);
    refresh(loc);
  }

  setInterval(tick, 60000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
