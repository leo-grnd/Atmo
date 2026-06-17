# ATMO — Qualité de l'air, UV & pollen

Outil web **statique** qui affiche, en temps réel et près de chez vous :

- l'**indice européen de qualité de l'air** (EAQI, 0 → 100+) et son palier (Bon → Extrêmement mauvais) ;
- l'**indice UV** du moment et le pic de la journée ;
- le **détail des polluants** (PM2.5, PM10, NO₂, O₃, SO₂, CO) avec mise en avant du polluant dominant ;
- le **risque pollen** du jour (Europe, en saison) ;
- une **prévision** horaire sur 3 jours ;
- un **conseil santé** clair : faut-il sortir, aérer, faire du sport ?

Gratuit, sans pub, sans compte. Tout tourne dans le navigateur.

## Données

- **Qualité de l'air / UV / pollen** : [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (service européen CAMS / Copernicus), **sans clé**.
- **Recherche de ville** : [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api).
- **Localisation → nom de lieu** : [BigDataCloud](https://www.bigdatacloud.com/) reverse geocoding (sans clé, optionnel).

Aucune donnée personnelle n'est collectée ni envoyée ailleurs : votre position sert uniquement à interroger l'API.

> ATMO est **informatif** et n'a aucune valeur sanitaire officielle. Pour les alertes, référez-vous à votre AASQA régionale (Atmo France).

## Stack

HTML / CSS / JavaScript **vanilla** (ES modules), **zéro dépendance, zéro build**. PWA (service worker + manifest), fonctionne hors-ligne grâce au cache. Déployable tel quel sur **GitHub Pages**.

Membre de la série d'outils brutalistes (Octane, Pantone-colors, EDF-Tempo) — même système de design.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Page principale |
| `style.css` | Design partagé + composants ATMO |
| `config.js` | **Seul point d'édition** : bandes AQI/UV, polluants, pollens, seuils, conseils |
| `app.js` | Logique : géoloc, recherche, fetch, cache, rendu, thème |
| `comment-ca-marche.html` / `.css` | Page explicative |
| `sw.js`, `manifest.webmanifest` | PWA / hors-ligne |

## Développer en local

```bash
python -m http.server 8000
# puis http://localhost:8000
```

Un serveur statique est nécessaire (les ES modules ne se chargent pas via `file://`).

## Déploiement

GitHub Pages depuis la branche `main` (dossier racine). Le fichier `.nojekyll` garantit que les fichiers sont servis tels quels.

## Licence

MIT — voir [LICENSE](LICENSE).
