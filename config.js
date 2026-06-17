// config.js — ATMO : référentiels qualité de l'air, UV, pollens & conseils.
// SEUL POINT D'ÉDITION pour les seuils et libellés. Aucune dépendance, aucun DOM.

/* ===========================================================================
   Indice européen de qualité de l'air (EAQI)
   Bornes officielles : 0–20 Bon · 20–40 Moyen · 40–60 Dégradé ·
   60–80 Mauvais · 80–100 Très mauvais · >100 Extrêmement mauvais.
   Les couleurs vivent dans style.css ([data-band="…"] → --aqi-*).
   =========================================================================== */
export const AQI_BANDS = [
  { max: 20, id: "good", label: "Bon" },
  { max: 40, id: "fair", label: "Moyen" },
  { max: 60, id: "moderate", label: "Dégradé" },
  { max: 80, id: "poor", label: "Mauvais" },
  { max: 100, id: "verypoor", label: "Très mauvais" },
  { max: Infinity, id: "extreme", label: "Extrêmement mauvais" },
];

export function aqiBand(value) {
  if (value == null || Number.isNaN(value)) return { id: "inconnu", label: "Indisponible" };
  return AQI_BANDS.find((b) => value <= b.max) || AQI_BANDS[AQI_BANDS.length - 1];
}

/* ===========================================================================
   Indice UV (échelle OMS)
   0–2 Faible · 3–5 Modéré · 6–7 Élevé · 8–10 Très élevé · 11+ Extrême
   =========================================================================== */
export const UV_BANDS = [
  { max: 2, id: "low", label: "Faible" },
  { max: 5, id: "mod", label: "Modéré" },
  { max: 7, id: "high", label: "Élevé" },
  { max: 10, id: "vhigh", label: "Très élevé" },
  { max: Infinity, id: "ext", label: "Extrême" },
];

export function uvBand(value) {
  if (value == null || Number.isNaN(value)) return { id: "inconnu", label: "Indisponible" };
  return UV_BANDS.find((b) => value <= b.max) || UV_BANDS[UV_BANDS.length - 1];
}

export const UV_ADVICE = {
  low: "Aucune protection nécessaire.",
  mod: "Lunettes et crème conseillées en milieu de journée.",
  high: "Protégez-vous : crème SPF 30+, chapeau, ombre entre 12 h et 16 h.",
  vhigh: "Forte exposition : évitez le soleil 12 h–16 h, protection indispensable.",
  ext: "Exposition extrême : restez à l'ombre, protection maximale.",
  inconnu: "Indice UV indisponible.",
};

/* ===========================================================================
   Polluants : concentration (µg/m³) + sous-indice EAQI.
   subIndex = clé du champ european_aqi_* renvoyé par l'API (null = hors EAQI).
   Le polluant « dominant » = celui dont le sous-indice est le plus élevé.
   =========================================================================== */
export const POLLUTANTS = [
  { key: "pm2_5", label: "PM2.5", name: "Particules fines", unit: "µg/m³", subIndex: "european_aqi_pm2_5" },
  { key: "pm10", label: "PM10", name: "Particules", unit: "µg/m³", subIndex: "european_aqi_pm10" },
  { key: "nitrogen_dioxide", label: "NO₂", name: "Dioxyde d'azote", unit: "µg/m³", subIndex: "european_aqi_nitrogen_dioxide" },
  { key: "ozone", label: "O₃", name: "Ozone", unit: "µg/m³", subIndex: "european_aqi_ozone" },
  { key: "sulphur_dioxide", label: "SO₂", name: "Dioxyde de soufre", unit: "µg/m³", subIndex: "european_aqi_sulphur_dioxide" },
  { key: "carbon_monoxide", label: "CO", name: "Monoxyde de carbone", unit: "µg/m³", subIndex: null },
];

/* ===========================================================================
   Pollens (Europe + saison uniquement ; sinon champs nuls → carte masquée)
   Seuils INDICATIFS en grains/m³ (ordres de grandeur CAMS, à affiner).
   =========================================================================== */
export const POLLENS = [
  { key: "grass_pollen", label: "Graminées" },
  { key: "birch_pollen", label: "Bouleau" },
  { key: "alder_pollen", label: "Aulne" },
  { key: "olive_pollen", label: "Olivier" },
  { key: "mugwort_pollen", label: "Armoise" },
  { key: "ragweed_pollen", label: "Ambroisie" },
];

export const POLLEN_LEVELS = [
  { max: 10, id: "low", label: "Faible" },
  { max: 50, id: "mod", label: "Modéré" },
  { max: 200, id: "high", label: "Élevé" },
  { max: Infinity, id: "vhigh", label: "Très élevé" },
];
export const POLLEN_SCALE_MAX = 200; // référence pour la largeur des barres

export function pollenLevel(value) {
  if (value == null || Number.isNaN(value)) return null;
  return POLLEN_LEVELS.find((l) => value <= l.max) || POLLEN_LEVELS[POLLEN_LEVELS.length - 1];
}

/* ===========================================================================
   Météo & dispersion du vent (contexte de la qualité de l'air)
   wind_speed_10m en km/h (unité Open-Meteo par défaut).
   =========================================================================== */
export const WIND_DISPERSION = [
  { max: 10, id: "low", label: "Dispersion faible", note: "Vent faible : les polluants se dispersent peu et peuvent stagner." },
  { max: 25, id: "mod", label: "Dispersion modérée", note: "Vent modéré : la dispersion des polluants est correcte." },
  { max: Infinity, id: "good", label: "Bonne dispersion", note: "Vent soutenu : les polluants se dispersent bien." },
];
export function windDispersion(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return null;
  return WIND_DISPERSION.find((w) => kmh <= w.max) || WIND_DISPERSION[WIND_DISPERSION.length - 1];
}

export const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

/* ===========================================================================
   Tendance — comparaison de l'AQI à 24 h.
   =========================================================================== */
export const HISTORY_HOURS = 48; // fenêtre de la sparkline passée
export const TREND_DELTA = 5; // écart (points d'indice) au-delà duquel on parle de hausse/baisse
export const TREND = {
  down: { id: "down", label: "L'air s'améliore", arrow: "↓" },
  up: { id: "up", label: "L'air se dégrade", arrow: "↑" },
  flat: { id: "flat", label: "Stable sur 24 h", arrow: "→" },
};

/* ===========================================================================
   Conseil santé — indexé par bande AQI.
   level : bon | moyen | danger | neutre (pilote la couleur de la carte).
   =========================================================================== */
export const ADVICE = {
  good: {
    level: "bon",
    title: "Air sain — profitez-en",
    detail: "Qualité de l'air bonne. Aérez votre logement et pratiquez vos activités extérieures sans restriction.",
  },
  fair: {
    level: "bon",
    title: "Air correct",
    detail: "Qualité de l'air acceptable pour la plupart. Les personnes très sensibles peuvent ressentir une gêne lors d'efforts intenses prolongés.",
  },
  moderate: {
    level: "moyen",
    title: "Air dégradé",
    detail: "Personnes sensibles (asthme, enfants, seniors) : limitez les efforts intenses en extérieur. Pour les autres, activités normales possibles.",
  },
  poor: {
    level: "danger",
    title: "Air mauvais",
    detail: "Réduisez les activités physiques intenses en extérieur. Les personnes sensibles devraient les reporter et rester à l'intérieur si possible.",
  },
  verypoor: {
    level: "danger",
    title: "Air très mauvais",
    detail: "Évitez les activités physiques en extérieur et gardez les fenêtres fermées aux heures de pointe. Personnes sensibles : restez à l'intérieur.",
  },
  extreme: {
    level: "danger",
    title: "Air extrêmement mauvais",
    detail: "Restez à l'intérieur autant que possible et limitez toute activité physique en extérieur. Suivez les recommandations sanitaires locales.",
  },
  inconnu: {
    level: "neutre",
    title: "Données indisponibles",
    detail: "Impossible de récupérer la qualité de l'air pour cette localisation pour le moment.",
  },
};
