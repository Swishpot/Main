import { Client, Account, Databases, Query, ID, Functions } from "appwrite";
import {
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  DATABASE_ID,
  COLLECTIONS,
  STARTING_BALANCE,
  INVITE_CODE_LENGTH,
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
  const daysFromTuesday = (day + 5) % 7;
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
  const startOfSeason = new Date(now.getFullYear(), 9, 22);
  if (now < startOfSeason) {
    startOfSeason.setFullYear(startOfSeason.getFullYear() - 1);
  }
  const weekNum = Math.floor((now - startOfSeason) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, weekNum);
};

const getSeasonYear = () => {
  const now = getAESTDate();
  const month = now.getMonth();
  return month >= 9 ? now.getFullYear() + 1 : now.getFullYear();
};

// ============ FETCH ALL DOCUMENTS (matches iOS app) ============

export const fetchAllDocuments = async (collectionId) => {
  try {
    // Use cloud function like iOS app does
    const execution = await functions.createExecution(
      "fetch-documents",
      JSON.stringify({ collection: collectionId }),
      false,
      "/",
      "POST"
    );

    if (execution.responseBody) {
      const result = JSON.parse(execution.responseBody);
      if (result.success && result.documents) {
        return result.documents;
      }
    }

    // Fallback to direct query
    console.log(`[fetchAllDocuments] Function failed for ${collectionId}, using fallback`);
  } catch (e) {
    console.log(`[fetchAllDocuments] Error for ${collectionId}:`, e.message);
  }

  // Fallback: Direct query with pagination
  try {
    let allDocuments = [];
    let lastId = null;
    const limit = 100;

    while (true) {
      const queries = [Query.limit(limit)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const response = await databases.listDocuments(DATABASE_ID, collectionId, queries);
      allDocuments = [...allDocuments, ...response.documents];

      if (response.documents.length < limit) {
        break;
      }

      lastId = response.documents[response.documents.length - 1].$id;
    }

    return allDocuments;
  } catch (error) {
    console.error(`[fetchAllDocuments] Fallback error for ${collectionId}:`, error);
    return [];
  }
};

// ============ AUTH FUNCTIONS ============

export const signIn = async (email, password) => {
  await account.createEmailPasswordSession(email, password);
  return await account.get();
};

export const signUp = async (email, password, displayName) => {
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
};

export const signOut = async () => {
  await account.deleteSession("current");
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

// ============ LEAGUE FUNCTIONS (matches iOS app pattern) ============

export const getUserLeagues = async (userId) => {
  try {
    console.log("[getUserLeagues] Starting for user:", userId);

    // Fetch ALL data in parallel like iOS app does
    const [allMemberships, allLeagueDocs, allWeeks] = await Promise.all([
      fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS),
      fetchAllDocuments(COLLECTIONS.LEAGUES),
      fetchAllDocuments(COLLECTIONS.WEEKS),
    ]);

    console.log("[getUserLeagues] Fetched:", {
      memberships: allMemberships.length,
      leagues: allLeagueDocs.length,
      weeks: allWeeks.length,
    });

    // Get league IDs this user is a member of
    const userLeagueIds = new Set(
      allMemberships
        .filter((m) => m.userId === userId)
        .map((m) => m.leagueId)
        .filter(Boolean)
    );

    console.log("[getUserLeagues] User is member of", userLeagueIds.size, "leagues");

    // Build leagues from pre-fetched data
    const leagues = [];
    for (const leagueDoc of allLeagueDocs) {
      if (!userLeagueIds.has(leagueDoc.$id)) continue;

      const league = {
        ...leagueDoc,
        members: allMemberships
          .filter((m) => m.leagueId === leagueDoc.$id)
          .map((m) => ({
            userId: m.userId,
            displayName: m.displayName || m.displayname || "Unknown",
            seasonPoints: parseFloat(m.seasonPoints) || 0,
            isAdmin: m.isAdmin === true || m.isAdmin === "true",
            joinedAt: m.joinedAt,
          })),
      };

      leagues.push(league);
    }

    console.log("[getUserLeagues] Returning", leagues.length, "leagues");
    return leagues;
  } catch (error) {
    console.error("[getUserLeagues] Error:", error);
    return [];
  }
};

export const getLeague = async (leagueId) => {
  const league = await databases.getDocument(DATABASE_ID, COLLECTIONS.LEAGUES, leagueId);
  const allMembers = await fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS);

  const members = allMembers
    .filter((m) => m.leagueId === leagueId)
    .map((m) => ({
      userId: m.userId,
      displayName: m.displayName || m.displayname || "Unknown",
      seasonPoints: parseFloat(m.seasonPoints) || 0,
      isAdmin: m.isAdmin === true || m.isAdmin === "true",
      joinedAt: m.joinedAt,
    }));

  return { ...league, members };
};

export const getLeagueByCode = async (inviteCode) => {
  const allLeagues = await fetchAllDocuments(COLLECTIONS.LEAGUES);
  return allLeagues.find((l) => l.inviteCode === inviteCode.toUpperCase()) || null;
};

export const createLeague = async (name, userId, displayName, leagueType = "Season") => {
  const inviteCode = generateInviteCode();
  const seasonYear = getSeasonYear();

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

  await createWeekForLeague(league.$id);
  return league;
};

export const joinLeague = async (inviteCode, userId, displayName) => {
  const league = await getLeagueByCode(inviteCode);
  if (!league) throw new Error("League not found");

  const allMembers = await fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS);
  const alreadyMember = allMembers.some(
    (m) => m.leagueId === league.$id && m.userId === userId
  );

  if (alreadyMember) {
    throw new Error("Already a member of this league");
  }

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
};

// ============ WEEK FUNCTIONS ============

export const createWeekForLeague = async (leagueId) => {
  const { startDate, endDate } = getWeekBounds();
  const weekNumber = getWeekNumber();
  const seasonYear = getSeasonYear();

  return await databases.createDocument(
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
};

export const getCurrentWeek = async (leagueId) => {
  const weekNumber = getWeekNumber();
  const seasonYear = getSeasonYear();

  // Fetch all weeks and filter
  const allWeeks = await fetchAllDocuments(COLLECTIONS.WEEKS);
  let week = allWeeks.find(
    (w) => w.leagueId === leagueId && w.weekNumber === weekNumber && w.seasonYear === seasonYear
  );

  if (!week) {
    week = await createWeekForLeague(leagueId);
  }

  // Get balances
  const allBalances = await fetchAllDocuments(COLLECTIONS.WEEK_BALANCES);
  const balances = allBalances.filter((b) => b.weekid === week.$id);

  return { ...week, balances };
};

export const getOrCreateUserBalance = async (weekId, leagueId, userId, displayName) => {
  const allBalances = await fetchAllDocuments(COLLECTIONS.WEEK_BALANCES);
  let balance = allBalances.find((b) => b.weekid === weekId && b.userid === userId);

  if (balance) {
    return balance;
  }

  return await databases.createDocument(
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
};

// ============ BET FUNCTIONS ============

export const placeBet = async (betSlip, userId, leagueId, weekId, displayName) => {
  const balanceDoc = await getOrCreateUserBalance(weekId, leagueId, userId, displayName);

  if (balanceDoc.balance < betSlip.stake) {
    throw new Error("Insufficient balance");
  }

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

  await databases.updateDocument(DATABASE_ID, COLLECTIONS.WEEK_BALANCES, balanceDoc.$id, {
    balance: balanceDoc.balance - betSlip.stake,
    totalbets: (balanceDoc.totalbets || 0) + 1,
  });

  return bet;
};

export const getUserBets = async (weekId, userId) => {
  const [allBets, allLegs] = await Promise.all([
    fetchAllDocuments(COLLECTIONS.BETS),
    fetchAllDocuments(COLLECTIONS.BET_LEGS),
  ]);

  const userBets = allBets
    .filter((b) => b.weekId === weekId && b.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return userBets.map((bet) => ({
    ...bet,
    legs: allLegs.filter((leg) => leg.betId === bet.$id),
  }));
};

export const getMemberBets = async (weekId, memberId, viewerId, visibilityMode) => {
  const bets = await getUserBets(weekId, memberId);

  return bets.map((bet) => {
    let showDetails = true;

    if (memberId !== viewerId) {
      if (visibilityMode === "Hidden") {
        showDetails = bet.status !== "pending";
      } else if (visibilityMode === "VisibleWhenLocked") {
        const allGamesStarted = bet.legs.every(
          (leg) => new Date(leg.gameTime) < new Date()
        );
        showDetails = allGamesStarted || bet.status !== "pending";
      }
    }

    return { ...bet, showDetails };
  });
};

// ============ LEADERBOARD FUNCTIONS ============

export const getLeaderboard = async (weekId) => {
  const allBalances = await fetchAllDocuments(COLLECTIONS.WEEK_BALANCES);
  const balances = allBalances.filter((b) => b.weekid === weekId);

  balances.sort((a, b) => {
    const balDiff = (b.balance || 0) - (a.balance || 0);
    if (balDiff !== 0) return balDiff;
    const payDiff = (b.highestwinpayout || 0) - (a.highestwinpayout || 0);
    if (payDiff !== 0) return payDiff;
    if (a.lastwintime && b.lastwintime) {
      return new Date(a.lastwintime) - new Date(b.lastwintime);
    }
    return 0;
  });

  return balances.map((b, i) => ({ ...b, rank: i + 1 }));
};

export const getSeasonLeaderboard = async (leagueId) => {
  const allMembers = await fetchAllDocuments(COLLECTIONS.LEAGUE_MEMBERS);
  const members = allMembers.filter((m) => m.leagueId === leagueId);

  members.sort((a, b) => (parseFloat(b.seasonPoints) || 0) - (parseFloat(a.seasonPoints) || 0));

  return members.map((m, i) => ({
    ...m,
    displayName: m.displayName || m.displayname || "Unknown",
    rank: i + 1,
  }));
};
