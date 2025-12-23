// Appwrite Configuration (from environment variables)
export const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;
export const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
export const DATABASE_ID = import.meta.env.VITE_DATABASE_ID;

// Collections
export const COLLECTIONS = {
  USERS: "users",
  LEAGUES: "leagues",
  LEAGUE_MEMBERS: "league_members",
  WEEKS: "weeks",
  WEEK_BALANCES: "week_balances",
  BETS: "bets",
  BET_LEGS: "bet_legs",
  GAMES_CACHE: "games_cache",
};

// The Odds API keys (from environment, comma-separated)
export const ODDS_API_KEYS = (import.meta.env.VITE_ODDS_API_KEYS || "").split(",").filter(Boolean);

// BALLDONTLIE API
export const BALLDONTLIE_API_KEY = import.meta.env.VITE_BALLDONTLIE_API_KEY;

// App Settings
export const STARTING_BALANCE = 1000;
export const MAX_LEAGUE_MEMBERS = 10;
export const INVITE_CODE_LENGTH = 6;

// Season Points Distribution
export const SEASON_POINTS_BY_RANK = {
  1: 10,
  2: 7,
  3: 5,
  4: 4,
  5: 3,
  6: 2,
  7: 1,
  8: 0,
  9: 0,
  10: 0,
};

// Market Types
export const MARKET_TYPES = {
  H2H: "h2h",
  SPREAD: "spread",
  TOTAL: "total",
  PLAYER_POINTS: "player_points",
  PLAYER_REBOUNDS: "player_rebounds",
  PLAYER_ASSISTS: "player_assists",
  PLAYER_THREES: "player_threes",
  PLAYER_PRA: "player_pra",
};

// Bet Status
export const BET_STATUS = {
  PENDING: "pending",
  WON: "won",
  LOST: "lost",
  VOID: "void",
};

// League Types
export const LEAGUE_TYPES = {
  SEASON: "Season",
  ONEOFF: "OneOff",
};

// Bet Visibility Modes
export const BET_VISIBILITY_MODES = {
  HIDDEN: "Hidden",
  VISIBLE: "Visible",
  VISIBLE_WHEN_LOCKED: "VisibleWhenLocked",
};
