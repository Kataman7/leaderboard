# 🎲 BoardScores - Suivi de Scores de Jeux de Société (PWA)

Application web **Progressive Web App (PWA)** mobile-first pour enregistrer des parties de jeux de société, suivre les scores, calculer les classements (global et par jeu) et tracer l'intégralité des actions dans un **historique append-only réversible (Undo / Redo)**.

---

## 📱 Fonctionnalités Principales

- **PWA Installable** : Conforme aux standards PWA avec `manifest.json` et `service worker` (`sw.js`). L'application peut être installée directement sur l'écran d'accueil d'un smartphone (iOS / Android) comme une application native.
- **Interface Mobile-First & Thème Sombre Minimaliste** :
  - Palette sombre soignée (`#0a0e17`, `#131b2e`), contrastes nets et animations fluides.
  - Barre de navigation ergonomique en bas d'écran avec zones de clic larges (touch-friendly $\ge 48\text{px}$).
  - Gros bouton d'action central vert émeraude vibrant (`+ Score`) pour enregistrer rapidement une partie.
- **Profils de Joueurs** : Création rapide de profils avec pseudo (directement dans le formulaire de partie ou dans l'onglet Joueurs).
- **Jeux de Société** :
  - Création de jeux avec nom et image (téléversement de fichier ou lien URL).
  - Navigation par jeu avec podium et statistiques dédiées.
- **Enregistrement de Parties** :
  - Sélection du jeu, date/heure, participants multiples.
  - Saisie des scores avec calcul et mise en avant automatique du/des gagnant(s) (couronne 👑 ajustable manuellement).
- **Classements** :
  - **Classement Global** basé sur le ratio de victoires ($\frac{\text{victoires}}{\text{parties jouées}}$), avec podium visuel (1er 🥇, 2ème 🥈, 3ème 🥉).
  - **Classement Spécifique par Jeu** sélectionnable en un clic.
- **Système d'Historique Append-Only & Annulation Réversible** :
  - Historique public de toutes les actions (création de joueur, jeu, partie, annulation).
  - **Annuler n'importe quelle action** : ne supprime aucune ligne en base ; enregistre un événement `UNDO_ACTION`.
  - **Annuler une annulation (Rétablir)** : permet de réactiver l'action d'origine.
  - Résolution d'état déterministe basée sur un graphe acyclique d'événements.

---

## 🏛️ Clean Architecture

Le projet respecte les principes de la **Clean Architecture** avec une séparation stricte des responsabilités :

```
leaderboard/
├── app/
│   ├── domain/               # Règles métier pures (zéro dépendance externe)
│   │   ├── models.py         # Entités Player, Game, Match, Action, LeaderboardEntry
│   │   └── history.py        # Logique de résolution Undo/Redo et calcul des ratios
│   ├── repositories/         # Accès aux données (SQLite)
│   │   ├── database.py       # Initialisation des tables & indexes SQLite
│   │   ├── action_repo.py    # Persistance de l'historique des actions
│   │   ├── player_repo.py    # Persistance des joueurs
│   │   ├── game_repo.py      # Persistance des jeux
│   │   └── match_repo.py     # Persistance des parties et scores
│   ├── services/             # Cas d'utilisation applicatifs
│   │   ├── history_service.py # Enregistrement d'action, undo, rétablissement, sync projections
│   │   ├── player_service.py  # Gestion des joueurs
│   │   ├── game_service.py    # Gestion des jeux
│   │   ├── match_service.py   # Gestion des scores & détection du gagnant
│   │   └── leaderboard_service.py # Calcul des classements global et par jeu
│   ├── api/                  # Couche Présentation / API REST (FastAPI)
│   │   ├── schemas.py        # Modèles de validation Pydantic
│   │   ├── dependencies.py   # Injection des dépendances
│   │   ├── routes_players.py # Endpoints /api/players
│   │   ├── routes_games.py   # Endpoints /api/games & upload
│   │   ├── routes_matches.py # Endpoints /api/matches
│   │   ├── routes_history.py # Endpoints /api/history & undo/reinstate
│   │   └── routes_leaderboard.py # Endpoints /api/leaderboard
│   ├── static/               # Frontend PWA (Vanilla JS + CSS sans build lourd)
│   │   ├── index.html        # Page principale et modales
│   │   ├── css/style.css     # Thème sombre minimaliste mobile
│   │   ├── js/app.js         # Client SPA, PWA install prompt & API client
│   │   ├── manifest.json     # Manifest PWA
│   │   ├── sw.js             # Service Worker (mise en cache & offline)
│   │   └── icons/            # Icônes SVG et PNG 192x192 / 512x512
│   └── main.py               # Point d'entrée FastAPI & montage des routes
├── tests/
│   ├── conftest.py           # Fixtures de test SQLite isolées en mémoire / temp
│   ├── unit/
│   │   ├── test_history_logic.py     # Tests de la logique d'annulation & rétablissement
│   │   └── test_leaderboard_logic.py # Tests de calcul des ratios et exclusions
│   └── integration/
│       ├── test_api_undo_redo.py     # Tests d'intégration API + base SQLite
│       └── test_pwa_and_static.py    # Tests des routes PWA & upload
├── Dockerfile                # Image Docker légère basée sur python:3.12-slim
├── docker-compose.yml        # Déploiement prêt à l'emploi avec persistance des volumes
└── requirements.txt
```

---

## 🔄 Structure de Base de Données & Système d'Historique

### Schéma SQLite

1. **Table `actions` (Journal d'événements append-only)** :
   - `id TEXT PRIMARY KEY` : Identifiant unique (UUID).
   - `action_type TEXT` : `CREATE_PLAYER`, `CREATE_GAME`, `RECORD_MATCH`, `UNDO_ACTION`.
   - `entity_type TEXT` : `player`, `game`, `match`, `action`.
   - `entity_id TEXT` : ID de l'entité concernée.
   - `target_action_id TEXT REFERENCES actions(id)` : Action ciblée lors d'un `UNDO_ACTION`.
   - `summary TEXT` : Description lisible (ex: *"Partie de Catan (Victoire : Alice)"*).
   - `details TEXT` : Snapshot JSON complet des données de l'action.
   - `created_at TEXT` : Horodatage ISO8601.

2. **Tables de Projection / Lecture** :
   - `players` (`id`, `name`, `created_by_action_id`, `is_active`, `created_at`)
   - `games` (`id`, `name`, `image_url`, `created_by_action_id`, `is_active`, `created_at`)
   - `matches` (`id`, `game_id`, `played_at`, `notes`, `created_by_action_id`, `is_active`, `created_at`)
   - `match_scores` (`id`, `match_id`, `player_id`, `score`, `is_winner`)

### Logique d'Annulation et de Rétablissement

- **Principe** : Aucune donnée n'est supprimée de la base de données.
- **Annuler une action $A$** : Crée une nouvelle action $U_1$ de type `UNDO_ACTION` ciblant $A$. L'action $A$ devient inactive (`is_active = 0`) et n'est plus prise en compte dans les classements.
- **Rétablir une action $A$** : L'action $U_1$ est elle-même annulée par une nouvelle action $U_2$ (`target_action_id = U1`). Comme $U_1$ est annulée, elle ne neutralise plus $A$ : l'action $A$ redevient active !
- La fonction `resolve_action_states` évalue ce graphe de dépendances de manière déterministe en temps linéaire.

---

## 🚀 Démarrage Rapide

### Option 1 : Avec Docker Compose (Recommandé)

Le projet dispose d'une configuration Docker prête à l'emploi :

```bash
# Lancer l'application
docker compose up --build -d

# Voir les logs
docker compose logs -f

# Arrêter l'application
docker compose down
```

L'application est immédiatement accessible sur [http://localhost:8000](http://localhost:8000). Les données SQLite et les images uploadées sont conservées dans le dossier `./data/` de l'hôte.

---

### Option 2 : En Local avec Python

Prérequis : Python 3.10+

```bash
# 1. Installer les dépendances
pip install -r requirements.txt

# 2. Lancer le serveur uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Ouvrez [http://localhost:8000](http://localhost:8000) dans votre navigateur.

---

## 🧪 Exécution des Tests

Le projet dispose de 16 tests unitaires et d'intégration couvrant :
- La logique d'annulation, d'annulation en chaîne (undo d'undo) et d'isolation d'actions.
- Le calcul des classements, le tri par ratio de victoires et l'exclusion des parties annulées.
- Le flux complet via l'API REST (création, match, annulation, rétablissement, vérification des classements).
- La validité du `manifest.json`, du `service worker`, des pages PWA et de l'upload d'images.

Pour exécuter la suite de tests :

```bash
pytest -v
```
