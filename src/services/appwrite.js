import { Client, Account, Databases, Query, ID, Functions } from "appwrite";
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  DATABASE_ID,
  COLLECTIONS,
  STARTING_BALANCE,
  INVITE_CODE_LENGTH,
  SEASON_POINTS_BY_RANK,
} from "../config";

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

export const account = new Account(client);
export const databases = new Databases(client);
export const functions = new Functions(client);

// Helper to generate invite codes
const generateInviteCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Get AEST timezone date helpers
const getAESTDate = (date = new Date()) => {
  return new Date(date.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
};

const getWeekBounds = () => {
  const now = getAESTDate();
  const day = now.getDay();

  // Find Tuesday (start of week)
  const daysFromTuesday = (day + 5) % 7; // Days since last Tuesday
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysFromTuesday);
  startDate.setHours(0, 0, 0, 0);

  // Find Monday (end of week)
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
};

const getWeekNumber = () => {
  const now = getAESTDate();
  const startOfSeason = new Date(now.getFullYear(), 9, 22); // Oct 22
  if (now < startOfSeason) {
    startOfSeason.setFullYear(startOfSeason.getFullYear() - 1);
  }
  const weekNum = Math.floor((now - startOfSeason) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, weekNum);
};

const getSeasonYear = () => {
  const now = getAESTDate();
  const month = now.getMonth();
  // NBA season ends in June, starts in October
  // Season year is the ending year (e.g., 2024-25 season = 2025)
  return month >= 9 ? now.getFullYear() + 1 : now.getFullYear();
};

// ============ AUTH FUNCTIONS ============

export const signIn = async (email, password) => {
  try {
    await account.createEmailPasswordSession(email, password);
    return await account.get();
  } catch (error) {
    throw error;
  }
};

export const signUp = async (email, password, displayName) => {
  try {
    await account.create(ID.unique(), email, password, displayName);
    await account.createEmailPasswordSession(email, password);
    const user = await account.get();

    // Create user document
    await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.USERS,
      user.$id,
      {
        userId: user.$id,
        displayName: displayName,
        email: email,
        createdAt: new Date().toISOString(),
        profileEmoji: "🏀",
      }
    );

    return user;
  } catch (error) {
    throw error;
  }
};

export const signOut = async () => {
  try {
    await account.deleteSession("current");
  } catch (error) {
    throw error;
  }
};

export const getCurrentUser = async () => {
  try {
    return await account.get();
  } catch (error) {
    return null;
  }
};

export const getUserProfile = async (userId) => {
  try {
    const doc = await databases.getDocument(DATABASE_ID, COLLECTIONS.USERS, userId);
    return doc;
  } catch (error) {
    return null;
  }
};

// ============ LEAGUE FUNCTIONS ============

export const getUserLeagues = async (userId) => {
  try {
    // Fetch all league memberships for user
    const membershipsResponse = await fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS, [
      Query.equal("userId", userId),
    ]);

    if (membershipsResponse.length === 0) return [];

    // Fetch all leagues in parallel
    const leagueIds = membershipsResponse.map((m) => m.leagueId);
    const leagues = await Promise.all(
      leagueIds.map(async (leagueId) => {
        try {
          const league = await databases.getDocument(DATABASE_ID, COLLECTIONS.LEAGUES, leagueId);

          // Get members for this league
          const members = await fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS, [
            Query.equal("leagueId", leagueId),
          ]);

          return { ...league, members };
        } catch (e) {
          return null;
        }
      })
    );

    return leagues.filter((l) => l !== null);
  } catch (error) {
    console.error("Error fetching leagues:", error);
    return [];
  }
};

export const getLeague = async (leagueId) => {
  try {
    const league = await databases.getDocument(DATABASE_ID, COLLECTIONS.LEAGUES, leagueId);

    // Get members
    const members = await fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS, [
      Query.equal("leagueId", leagueId),
    ]);

    return { ...league, members };
  } catch (error) {
    throw error;
  }
};

export const getLeagueByCode = async (inviteCode) => {
  try {
    const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.LEAGUES, [
      Query.equal("inviteCode", inviteCode.toUpperCase()),
    ]);

    if (response.documents.length === 0) return null;
    return response.documents[0];
  } catch (error) {
    throw error;
  }
};

export const createLeague = async (name, userId, displayName, leagueType = "Season") => {
  try {
    const inviteCode = generateInviteCode();
    const seasonYear = getSeasonYear();

    // Create league
    const league = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.LEAGUES,
      ID.unique(),
      {
        name,
        inviteCode,
        createdBy: userId,
        maxMembers: 10,
        createdAt: new Date().toISOString(),
        leagueType,
        seasonYear,
        betVisibilityMode: "Visible",
        isPaused: false,
      }
    );

    // Add creator as admin member
    await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.LEAGUE_MEMBERS,
      ID.unique(),
      {
        leagueId: league.$id,
        userId,
        displayName,
        seasonPoints: 0,
        isAdmin: true,
        joinedAt: new Date().toISOString(),
      }
    );

    // Create first week
    await createWeekForLeague(league.$id);

    return league;
  } catch (error) {
    throw error;
  }
};

export const joinLeague = async (inviteCode, userId, displayName) => {
  try {
    const league = await getLeagueByCode(inviteCode);
    if (!league) throw new Error("League not found");

    // Check if already a member
    const existingMembership = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.LEAGUE_MEMBERS,
      [Query.equal("leagueId", league.$id), Query.equal("userId", userId)]
    );

    if (existingMembership.documents.length > 0) {
      throw new Error("Already a member of this league");
    }

    // Add as member
    await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.LEAGUE_MEMBERS,
      ID.unique(),
      {
        leagueId: league.$id,
        userId,
        displayName,
        seasonPoints: 0,
        isAdmin: false,
        joinedAt: new Date().toISOString(),
      }
    );

    return league;
  } catch (error) {
    throw error;
  }
};

// ============ WEEK FUNCTIONS ============

export const createWeekForLeague = async (leagueId) => {
  const { startDate, endDate } = getWeekBounds();
  const weekNumber = getWeekNumber();
  const seasonYear = getSeasonYear();

  const week = await databases.createDocument(
    DATABASE_ID,
    COLLECTIONS.WEEKS,
    ID.unique(),
    {
      leagueId,
      weekNumber,
      seasonYear,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: "Active",
      winnerId: null,
    }
  );

  return week;
};

export const getCurrentWeek = async (leagueId) => {
  try {
    const { startDate, endDate } = getWeekBounds();
    const weekNumber = getWeekNumber();
    const seasonYear = getSeasonYear();

    // Try to find existing week
    const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WEEKS, [
      Query.equal("leagueId", leagueId),
      Query.equal("weekNumber", weekNumber),
      Query.equal("seasonYear", seasonYear),
    ]);

    let week;
    if (response.documents.length > 0) {
      week = response.documents[0];
    } else {
      // Create new week
      week = await createWeekForLeague(leagueId);
    }

    // Get balances for this week
    const balances = await fetchAllDocuments(COLLECTIONS.WEEK_BALANCES, [
      Query.equal("weekid", week.$id),
    ]);

    return { ...week, balances };
  } catch (error) {
    throw error;
  }
};

export const getOrCreateUserBalance = async (weekId, leagueId, userId, displayName) => {
  try {
    // Check for existing balance
    const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WEEK_BALANCES, [
      Query.equal("weekid", weekId),
      Query.equal("userid", userId),
    ]);

    if (response.documents.length > 0) {
      return response.documents[0];
    }

    // Create new balance
    const balance = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.WEEK_BALANCES,
      ID.unique(),
      {
        weekid: weekId,
        leagueid: leagueId,
        userid: userId,
        displayname: displayName,
        balance: STARTING_BALANCE,
        highestwinpayout: 0,
        totalbets: 0,
        lastwintime: null,
      }
    );

    return balance;
  } catch (error) {
    throw error;
  }
};

export const getUserBalance = async (weekId, userId) => {
  try {
    const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.WEEK_BALANCES, [
      Query.equal("weekid", weekId),
      Query.equal("userid", userId),
    ]);

    if (response.documents.length > 0) {
      return response.documents[0];
    }
    return null;
  } catch (error) {
    return null;
  }
};

// ============ BET FUNCTIONS ============

export const placeBet = async (betSlip, userId, leagueId, weekId, displayName) => {
  try {
    // Get or create balance
    const balanceDoc = await getOrCreateUserBalance(weekId, leagueId, userId, displayName);

    if (balanceDoc.balance < betSlip.stake) {
      throw new Error("Insufficient balance");
    }

    // Create bet document
    const bet = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.BETS,
      ID.unique(),
      {
        userId,
        leagueId,
        weekId,
        betType: betSlip.items.length > 1 ? "SGM" : "Single",
        stake: betSlip.stake,
        totalOdds: betSlip.totalOdds,
        potentialPayout: betSlip.potentialPayout,
        status: "pending",
        settledAt: null,
        createdAt: new Date().toISOString(),
      }
    );

    // Create leg documents
    for (const item of betSlip.items) {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.BET_LEGS,
        ID.unique(),
        {
          betId: bet.$id,
          gameId: item.gameId,
          gameDescription: item.gameDescription,
          gameTime: item.gameTime,
          marketType: item.marketType,
          selection: item.selection,
          odds: item.odds,
          line: item.line || null,
          result: "pending",
          actualValue: null,
          playerName: item.playerName || null,
        }
      );
    }

    // Update balance
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.WEEK_BALANCES, balanceDoc.$id, {
      balance: balanceDoc.balance - betSlip.stake,
      totalbets: balanceDoc.totalbets + 1,
    });

    return bet;
  } catch (error) {
    throw error;
  }
};

export const getUserBets = async (weekId, userId) => {
  try {
    const betsResponse = await fetchAllDocuments(COLLECTIONS.BETS, [
      Query.equal("weekId", weekId),
      Query.equal("userId", userId),
      Query.orderDesc("createdAt"),
    ]);

    // Fetch legs for each bet
    const betsWithLegs = await Promise.all(
      betsResponse.map(async (bet) => {
        const legs = await fetchAllDocuments(COLLECTIONS.BET_LEGS, [
          Query.equal("betId", bet.$id),
        ]);
        return { ...bet, legs };
      })
    );

    return betsWithLegs;
  } catch (error) {
    console.error("Error fetching bets:", error);
    return [];
  }
};

export const getMemberBets = async (weekId, userId, viewerId, leagueVisibilityMode) => {
  try {
    const bets = await getUserBets(weekId, userId);

    // Apply visibility rules
    return bets.map((bet) => {
      let showDetails = true;

      if (userId !== viewerId) {
        if (leagueVisibilityMode === "Hidden") {
          showDetails = bet.status !== "pending";
        } else if (leagueVisibilityMode === "VisibleWhenLocked") {
          // Check if all games have started
          const allGamesStarted = bet.legs.every(
            (leg) => new Date(leg.gameTime) < new Date()
          );
          showDetails = allGamesStarted || bet.status !== "pending";
        }
      }

      return { ...bet, showDetails };
    });
  } catch (error) {
    return [];
  }
};

// ============ HELPER FUNCTIONS ============

export const fetchAllDocuments = async (collectionId, queries = []) => {
  try {
    // Try cloud function first for large collections
    try {
      const execution = await functions.createExecution(
        "fetch-documents",
        JSON.stringify({ collection: collectionId, queries: queries.map(q => q.toString()) }),
        false
      );

      if (execution.responseBody) {
        const result = JSON.parse(execution.responseBody);
        if (result.documents) {
          return result.documents;
        }
      }
    } catch (e) {
      // Fall back to direct query
    }

    // Direct query with pagination
    let allDocuments = [];
    let lastId = null;
    const limit = 100;

    while (true) {
      const paginatedQueries = [...queries, Query.limit(limit)];
      if (lastId) {
        paginatedQueries.push(Query.cursorAfter(lastId));
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        collectionId,
        paginatedQueries
      );

      allDocuments = [...allDocuments, ...response.documents];

      if (response.documents.length < limit) {
        break;
      }

      lastId = response.documents[response.documents.length - 1].$id;
    }

    return allDocuments;
  } catch (error) {
    console.error(`Error fetching documents from ${collectionId}:`, error);
    return [];
  }
};

export const getLeaderboard = async (weekId) => {
  try {
    const balances = await fetchAllDocuments(COLLECTIONS.WEEK_BALANCES, [
      Query.equal("weekid", weekId),
    ]);

    // Sort by balance desc, then by highest win payout, then by last win time
    balances.sort((a, b) => {
      if (b.balance !== a.balance) return b.balance - a.balance;
      if (b.highestwinpayout !== a.highestwinpayout) return b.highestwinpayout - a.highestwinpayout;
      if (a.lastwintime && b.lastwintime) {
        return new Date(a.lastwintime) - new Date(b.lastwintime);
      }
      return 0;
    });

    // Add ranks
    return balances.map((b, i) => ({ ...b, rank: i + 1 }));
  } catch (error) {
    return [];
  }
};

export const getSeasonLeaderboard = async (leagueId) => {
  try {
    const members = await fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS, [
      Query.equal("leagueId", leagueId),
    ]);

    // Sort by season points
    members.sort((a, b) => b.seasonPoints - a.seasonPoints);

    return members.map((m, i) => ({ ...m, rank: i + 1 }));
  } catch (error) {
    return [];
  }
};
