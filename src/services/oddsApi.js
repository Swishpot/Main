import { databases } from "./appwrite";
import { DATABASE_ID, COLLECTIONS, ODDS_API_KEYS, MARKET_TYPES } from "../config";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

let currentKeyIndex = 0;

const getNextApiKey = () => {
  const key = ODDS_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % ODDS_API_KEYS.length;
  return key;
};

// Fetch from API with key rotation
const fetchWithKeyRotation = async (url) => {
  let lastError;

  for (let i = 0; i < ODDS_API_KEYS.length; i++) {
    const apiKey = getNextApiKey();
    try {
      const fullUrl = `${url}&apiKey=${apiKey}`;
      const response = await fetch(fullUrl);

      if (response.status === 401 || response.status === 429) {
        continue; // Try next key
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("All API keys exhausted");
};

// Get cached odds from Appwrite
export const getCachedOdds = async () => {
  try {
    const doc = await databases.getDocument(
      DATABASE_ID,
      COLLECTIONS.GAMES_CACHE,
      "current_odds"
    );

    // Return cached data if it exists (24 hour validity like iOS app)
    if (doc.gamesJson) {
      const lastUpdated = new Date(doc.lastUpdated);
      const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);

      // Log cache age for debugging
      console.log(`[getCachedOdds] Cache age: ${hoursSinceUpdate.toFixed(1)} hours, games: ${doc.gameCount}`);

      // Use cache if less than 24 hours old
      if (hoursSinceUpdate < 24) {
        const games = JSON.parse(doc.gamesJson);
        console.log(`[getCachedOdds] First game raw data:`, games[0] ? Object.keys(games[0]) : "empty");
        // Normalize game data - iOS app uses PascalCase, web API uses camelCase
        const normalizedGames = games.map(game => {
          // Get the ID (iOS uses "Id", web uses "id")
          const gameId = game.Id || game.id || game.gameId || game.eventId;
          // Get team names (iOS uses "HomeTeam", web uses "homeTeam" or "home_team")
          const homeTeam = game.HomeTeam || game.homeTeam || game.home_team || "";
          const awayTeam = game.AwayTeam || game.awayTeam || game.away_team || "";
          // Get abbreviations
          const homeTeamAbbr = game.HomeTeamAbbr || game.homeTeamAbbr || getTeamAbbr(homeTeam);
          const awayTeamAbbr = game.AwayTeamAbbr || game.awayTeamAbbr || getTeamAbbr(awayTeam);
          // Get commence time (iOS uses "CommenceTime", web uses "commenceTime" or "commence_time")
          const commenceTime = game.CommenceTime || game.commenceTime || game.commence_time || game.startTime;
          // Get markets (iOS uses "Markets", web uses "markets")
          const rawMarkets = game.Markets || game.markets || [];
          // Normalize markets (iOS uses PascalCase for market properties too)
          // iOS enum values: H2H, Spread, Total vs web API: h2h, spreads, totals
          const normalizeMarketType = (type) => {
            if (!type) return "";
            const t = String(type).toLowerCase();
            // Map iOS enum names to web API names
            if (t === "spread") return "spreads";
            if (t === "total") return "totals";
            return t;
          };
          const markets = rawMarkets.map(m => ({
            type: normalizeMarketType(m.Type || m.type),
            outcomes: (m.Outcomes || m.outcomes || []).map(o => ({
              name: o.Name || o.name || "",
              odds: o.Odds || o.odds || 0,
              line: o.Line || o.line || null,
            }))
          }));

          // Get player props (iOS stores them with the game in cache)
          const rawPlayerProps = game.PlayerProps || game.playerProps || [];

          // Normalize prop type from iOS enum names to web API format
          const normalizePropType = (type) => {
            if (!type) return "";
            const t = String(type).toLowerCase();
            // Map iOS enum names to web API format with underscores
            const propTypeMap = {
              "playerpoints": "player_points",
              "playerrebounds": "player_rebounds",
              "playerassists": "player_assists",
              "playerthrees": "player_threes",
              "playerpra": "player_pra",
              "player_points_rebounds_assists": "player_pra",
            };
            return propTypeMap[t] || t;
          };

          const playerProps = rawPlayerProps.map(p => ({
            playerId: p.PlayerId || p.playerId || "",
            playerName: p.PlayerName || p.playerName || "",
            propType: normalizePropType(p.PropType || p.propType),
            line: p.Line || p.line || 0,
            overOdds: p.OverOdds || p.overOdds || 0,
            underOdds: p.UnderOdds || p.underOdds || 0,
          }));

          // Get locked status
          const isLocked = game.IsLocked ?? game.isLocked ?? (commenceTime ? new Date(commenceTime) < new Date() : false);

          return {
            id: gameId,
            homeTeam,
            awayTeam,
            homeTeamAbbr,
            awayTeamAbbr,
            commenceTime,
            markets,
            playerProps, // Include player props from cache
            isLocked,
          };
        });
        console.log(`[getCachedOdds] First normalized game:`, normalizedGames[0] ? {
          id: normalizedGames[0].id,
          homeTeam: normalizedGames[0].homeTeam,
          markets: normalizedGames[0].markets?.length,
          playerProps: normalizedGames[0].playerProps?.length
        } : "empty");
        return normalizedGames;
      }
    }

    return null;
  } catch (error) {
    console.log("[getCachedOdds] Error:", error.message);
    return null;
  }
};

// Save odds to cache
export const saveOddsToCache = async (games) => {
  try {
    await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.GAMES_CACHE,
      "current_odds",
      {
        gamesJson: JSON.stringify(games),
        lastUpdated: new Date().toISOString(),
        gameCount: games.length,
      }
    );
  } catch (error) {
    console.error("Error saving to cache:", error);
  }
};

// Fetch fresh odds from The Odds API
export const fetchOdds = async (forceRefresh = false) => {
  try {
    // Check cache first
    if (!forceRefresh) {
      const cached = await getCachedOdds();
      if (cached) {
        return cached;
      }
    }

    // Fetch from API
    const url = `${ODDS_API_BASE}/sports/basketball_nba/odds/?regions=au&markets=h2h,spreads,totals&dateFormat=iso`;
    const data = await fetchWithKeyRotation(url);

    const games = data.map((game) => parseGame(game));

    // Save to cache
    await saveOddsToCache(games);

    return games;
  } catch (error) {
    console.error("Error fetching odds:", error);

    // Try cache as fallback
    const cached = await getCachedOdds();
    return cached || [];
  }
};

// Fetch player props for a specific game
export const fetchPlayerProps = async (gameId) => {
  try {
    const markets = "player_points,player_rebounds,player_assists,player_threes,player_points_rebounds_assists";
    const url = `${ODDS_API_BASE}/sports/basketball_nba/events/${gameId}/odds?regions=au&markets=${markets}&dateFormat=iso`;

    const data = await fetchWithKeyRotation(url);

    if (!data || !data.bookmakers) {
      return [];
    }

    return parsePlayerProps(data.bookmakers);
  } catch (error) {
    console.error("Error fetching player props:", error);
    return [];
  }
};

// Parse game data from API response
const parseGame = (apiGame) => {
  const game = {
    id: apiGame.id,
    homeTeam: apiGame.home_team,
    awayTeam: apiGame.away_team,
    homeTeamAbbr: getTeamAbbr(apiGame.home_team),
    awayTeamAbbr: getTeamAbbr(apiGame.away_team),
    commenceTime: apiGame.commence_time,
    lastUpdated: new Date().toISOString(),
    markets: [],
    playerProps: [],
    isLocked: new Date(apiGame.commence_time) < new Date(),
  };

  // Find best bookmaker (prefer TAB, Sportsbet, or first available)
  const preferredBooks = ["tab", "sportsbet", "pointsbet", "unibet"];
  let bookmaker = apiGame.bookmakers?.find((b) =>
    preferredBooks.some((p) => b.key.toLowerCase().includes(p))
  ) || apiGame.bookmakers?.[0];

  if (bookmaker) {
    for (const market of bookmaker.markets) {
      const parsedMarket = {
        type: market.key,
        outcomes: market.outcomes.map((o) => ({
          name: o.name,
          odds: o.price,
          line: o.point || null,
        })),
      };
      game.markets.push(parsedMarket);
    }
  }

  return game;
};

// Parse player props from bookmakers
const parsePlayerProps = (bookmakers) => {
  const props = [];
  const seenPlayers = new Map();

  // Prefer Australian bookmakers
  const preferredBooks = ["tab", "sportsbet", "pointsbet"];
  const sortedBookmakers = [...bookmakers].sort((a, b) => {
    const aPreferred = preferredBooks.some((p) => a.key.toLowerCase().includes(p));
    const bPreferred = preferredBooks.some((p) => b.key.toLowerCase().includes(p));
    return bPreferred - aPreferred;
  });

  for (const bookmaker of sortedBookmakers) {
    for (const market of bookmaker.markets) {
      const propType = mapPropType(market.key);
      if (!propType) continue;

      for (const outcome of market.outcomes) {
        const key = `${outcome.description}-${propType}`;

        if (!seenPlayers.has(key)) {
          const prop = {
            playerId: outcome.description.replace(/\s+/g, "_").toLowerCase(),
            playerName: outcome.description,
            propType,
            line: outcome.point,
            overOdds: outcome.name === "Over" ? outcome.price : null,
            underOdds: outcome.name === "Under" ? outcome.price : null,
          };
          seenPlayers.set(key, prop);
        } else {
          const existing = seenPlayers.get(key);
          if (outcome.name === "Over") {
            existing.overOdds = outcome.price;
          } else {
            existing.underOdds = outcome.price;
          }
        }
      }
    }
  }

  return Array.from(seenPlayers.values()).filter(
    (p) => p.overOdds && p.underOdds
  );
};

const mapPropType = (apiMarket) => {
  const mapping = {
    player_points: MARKET_TYPES.PLAYER_POINTS,
    player_rebounds: MARKET_TYPES.PLAYER_REBOUNDS,
    player_assists: MARKET_TYPES.PLAYER_ASSISTS,
    player_threes: MARKET_TYPES.PLAYER_THREES,
    player_points_rebounds_assists: MARKET_TYPES.PLAYER_PRA,
  };
  return mapping[apiMarket] || null;
};

// Team abbreviations
const TEAM_ABBRS = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

const getTeamAbbr = (teamName) => {
  return TEAM_ABBRS[teamName] || teamName.substring(0, 3).toUpperCase();
};

// Format odds for display (American to decimal if needed)
export const formatOdds = (odds) => {
  if (odds == null || isNaN(odds)) return "-";
  return odds.toFixed(2);
};

// Calculate parlay odds
export const calculateParlayOdds = (selections) => {
  return selections.reduce((total, sel) => total * sel.odds, 1);
};
