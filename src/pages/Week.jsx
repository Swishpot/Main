import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBetSlip, BetSlipProvider } from "../context/BetSlipContext";
import {
  getLeague,
  getCurrentWeek,
  getOrCreateUserBalance,
  getLeaderboard,
  getSeasonLeaderboard,
  getUserBets,
  getMemberBets,
  placeBet,
} from "../services/appwrite";
import { fetchOdds, fetchPlayerProps, formatOdds } from "../services/oddsApi";
import BetSlipPanel from "../components/BetSlipPanel";
import GameCard from "../components/GameCard";
import "../styles/Week.css";

function WeekContent() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const betSlip = useBetSlip();

  const [league, setLeague] = useState(null);
  const [week, setWeek] = useState(null);
  const [balance, setBalance] = useState(null);
  const [games, setGames] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [seasonLeaderboard, setSeasonLeaderboard] = useState([]);
  const [myBets, setMyBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("games"); // games, leaderboard, season
  const [selectedGame, setSelectedGame] = useState(null);
  const [playerProps, setPlayerProps] = useState([]);
  const [propsLoading, setPropsLoading] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);

  useEffect(() => {
    loadData();
  }, [leagueId, user]);

  const loadData = async () => {
    if (!user || !leagueId) return;
    setLoading(true);

    try {
      // Load league and week in parallel
      const [leagueData, weekData, gamesData] = await Promise.all([
        getLeague(leagueId),
        getCurrentWeek(leagueId),
        fetchOdds(),
      ]);

      setLeague(leagueData);
      setWeek(weekData);
      setGames(gamesData);

      // Get or create user balance
      const displayName = userProfile?.displayName || user.name || "Player";
      const balanceData = await getOrCreateUserBalance(
        weekData.$id,
        leagueId,
        user.$id,
        displayName
      );
      setBalance(balanceData);

      // Load leaderboard and bets
      const [leaderboardData, seasonData, betsData] = await Promise.all([
        getLeaderboard(weekData.$id),
        getSeasonLeaderboard(leagueId),
        getUserBets(weekData.$id, user.$id),
      ]);

      setLeaderboard(leaderboardData);
      setSeasonLeaderboard(seasonData);
      setMyBets(betsData);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGameClick = async (game) => {
    if (game.isLocked) return;

    setSelectedGame(game);
    setPropsLoading(true);

    try {
      const props = await fetchPlayerProps(game.id);
      setPlayerProps(props);
    } catch (err) {
      console.error("Error loading player props:", err);
      setPlayerProps([]);
    } finally {
      setPropsLoading(false);
    }
  };

  const handlePlaceBet = async () => {
    if (betSlip.isEmpty || betSlip.hasConflict || placingBet) return;
    if (betSlip.stake <= 0 || betSlip.stake > (balance?.balance || 0)) return;

    setPlacingBet(true);

    try {
      const displayName = userProfile?.displayName || user.name || "Player";
      await placeBet(
        {
          items: betSlip.items,
          stake: betSlip.stake,
          totalOdds: betSlip.totalOdds,
          potentialPayout: betSlip.potentialPayout,
        },
        user.$id,
        leagueId,
        week.$id,
        displayName
      );

      betSlip.clearBetSlip();
      await loadData(); // Refresh data
    } catch (err) {
      console.error("Error placing bet:", err);
      alert(err.message || "Failed to place bet");
    } finally {
      setPlacingBet(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount) => {
    return `$${(amount || 0).toLocaleString("en-AU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  if (loading) {
    return (
      <div className="week-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="week-page">
      <header className="week-header">
        <button className="btn-back" onClick={() => navigate("/leagues")}>
          ← Back
        </button>
        <div className="header-info">
          <h1>{league?.name}</h1>
          <span className="week-number">Week {week?.weekNumber}</span>
        </div>
        <div className="balance-display">
          <span className="balance-label">Balance</span>
          <span className="balance-amount">{formatCurrency(balance?.balance)}</span>
        </div>
      </header>

      <nav className="week-tabs">
        <button
          className={`tab ${activeTab === "games" ? "active" : ""}`}
          onClick={() => setActiveTab("games")}
        >
          Games
        </button>
        <button
          className={`tab ${activeTab === "leaderboard" ? "active" : ""}`}
          onClick={() => setActiveTab("leaderboard")}
        >
          Leaderboard
        </button>
        <button
          className={`tab ${activeTab === "mybets" ? "active" : ""}`}
          onClick={() => setActiveTab("mybets")}
        >
          My Bets
        </button>
        <button
          className={`tab ${activeTab === "season" ? "active" : ""}`}
          onClick={() => setActiveTab("season")}
        >
          Season
        </button>
      </nav>

      <main className="week-content">
        {activeTab === "games" && (
          <div className="games-section">
            {games.length === 0 ? (
              <div className="no-games">
                <p>No games available right now.</p>
                <p>Check back closer to game time!</p>
              </div>
            ) : (
              <div className="games-list">
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    onClick={() => handleGameClick(game)}
                    isSelected={selectedGame?.id === game.id}
                  />
                ))}
              </div>
            )}

            {/* Selected Game Detail */}
            {selectedGame && (
              <div className="game-detail">
                <div className="game-detail-header">
                  <h3>
                    {selectedGame.awayTeam} @ {selectedGame.homeTeam}
                  </h3>
                  <button
                    className="btn-close"
                    onClick={() => setSelectedGame(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="game-time">{formatDate(selectedGame.commenceTime)}</p>

                {/* Markets */}
                <div className="markets-section">
                  {(selectedGame.markets || []).map((market) => (
                    <div key={market.type} className="market">
                      <h4>
                        {market.type === "h2h"
                          ? "Winner"
                          : market.type === "spreads"
                          ? "Spread"
                          : "Total Points"}
                      </h4>
                      <div className="market-outcomes">
                        {market.outcomes.map((outcome) => {
                          const selection =
                            market.type === "h2h"
                              ? outcome.name
                              : market.type === "spreads"
                              ? `${outcome.name} ${outcome.line > 0 ? "+" : ""}${outcome.line}`
                              : `${outcome.name} ${outcome.line}`;

                          const isSelected = betSlip.isSelected(
                            selectedGame.id,
                            market.type,
                            selection
                          );

                          return (
                            <button
                              key={outcome.name}
                              className={`outcome-btn ${isSelected ? "selected" : ""}`}
                              onClick={() =>
                                betSlip.addSelection({
                                  gameId: selectedGame.id,
                                  gameDescription: `${selectedGame.awayTeam} @ ${selectedGame.homeTeam}`,
                                  gameTime: selectedGame.commenceTime,
                                  marketType: market.type,
                                  selection,
                                  odds: outcome.odds,
                                  line: outcome.line,
                                })
                              }
                            >
                              <span className="outcome-name">{selection}</span>
                              <span className="outcome-odds">
                                {formatOdds(outcome.odds)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Player Props */}
                {propsLoading ? (
                  <div className="props-loading">Loading player props...</div>
                ) : playerProps.length > 0 ? (
                  <div className="player-props-section">
                    <h4>Player Props</h4>
                    {playerProps.map((prop) => {
                      const overSelection = `${prop.playerName} Over ${prop.line}`;
                      const underSelection = `${prop.playerName} Under ${prop.line}`;
                      const isOverSelected = betSlip.isSelected(
                        selectedGame.id,
                        prop.propType,
                        overSelection
                      );
                      const isUnderSelected = betSlip.isSelected(
                        selectedGame.id,
                        prop.propType,
                        underSelection
                      );

                      return (
                        <div key={`${prop.playerId}-${prop.propType}`} className="prop-row">
                          <div className="prop-info">
                            <span className="player-name">{prop.playerName}</span>
                            <span className="prop-type">
                              {prop.propType.replace("player_", "").replace("_", " ")}
                            </span>
                          </div>
                          <div className="prop-line">{prop.line}</div>
                          <div className="prop-buttons">
                            <button
                              className={`prop-btn ${isOverSelected ? "selected" : ""}`}
                              onClick={() =>
                                betSlip.addSelection({
                                  gameId: selectedGame.id,
                                  gameDescription: `${selectedGame.awayTeam} @ ${selectedGame.homeTeam}`,
                                  gameTime: selectedGame.commenceTime,
                                  marketType: prop.propType,
                                  selection: overSelection,
                                  odds: prop.overOdds,
                                  line: prop.line,
                                  playerName: prop.playerName,
                                })
                              }
                            >
                              O {formatOdds(prop.overOdds)}
                            </button>
                            <button
                              className={`prop-btn ${isUnderSelected ? "selected" : ""}`}
                              onClick={() =>
                                betSlip.addSelection({
                                  gameId: selectedGame.id,
                                  gameDescription: `${selectedGame.awayTeam} @ ${selectedGame.homeTeam}`,
                                  gameTime: selectedGame.commenceTime,
                                  marketType: prop.propType,
                                  selection: underSelection,
                                  odds: prop.underOdds,
                                  line: prop.line,
                                  playerName: prop.playerName,
                                })
                              }
                            >
                              U {formatOdds(prop.underOdds)}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {activeTab === "leaderboard" && (
          <div className="leaderboard-section">
            <h2>Week {week?.weekNumber} Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p className="no-data">No activity yet this week</p>
            ) : (
              <div className="leaderboard-list">
                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.$id}
                    className={`leaderboard-row ${
                      entry.userid === user.$id ? "current-user" : ""
                    }`}
                  >
                    <span className="rank">#{index + 1}</span>
                    <span className="name">{entry.displayname}</span>
                    <span className={`balance ${entry.balance >= 1000 ? "profit" : "loss"}`}>
                      {formatCurrency(entry.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "mybets" && (
          <div className="mybets-section">
            <h2>My Bets</h2>
            {myBets.length === 0 ? (
              <p className="no-data">No bets placed this week</p>
            ) : (
              <div className="bets-list">
                {myBets.map((bet) => (
                  <div key={bet.$id} className={`bet-card ${bet.status}`}>
                    <div className="bet-header">
                      <span className="bet-type">
                        {bet.betType === "SGM" ? "Same Game Multi" : "Single"}
                      </span>
                      <span className={`bet-status ${bet.status}`}>
                        {bet.status.charAt(0).toUpperCase() + bet.status.slice(1)}
                      </span>
                    </div>
                    <div className="bet-legs">
                      {bet.legs?.map((leg, i) => (
                        <div key={i} className={`bet-leg ${leg.result}`}>
                          <span className="leg-game">{leg.gameDescription}</span>
                          <span className="leg-selection">{leg.selection}</span>
                          <span className="leg-odds">{formatOdds(leg.odds)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bet-footer">
                      <span>Stake: {formatCurrency(bet.stake)}</span>
                      <span>
                        {bet.status === "won"
                          ? `Won: ${formatCurrency(bet.potentialPayout)}`
                          : `Potential: ${formatCurrency(bet.potentialPayout)}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "season" && (
          <div className="season-section">
            <h2>Season Standings</h2>
            {seasonLeaderboard.length === 0 ? (
              <p className="no-data">No season data yet</p>
            ) : (
              <div className="leaderboard-list">
                {seasonLeaderboard.map((member, index) => (
                  <div
                    key={member.$id}
                    className={`leaderboard-row ${
                      member.userId === user.$id ? "current-user" : ""
                    }`}
                  >
                    <span className="rank">#{index + 1}</span>
                    <span className="name">{member.displayName}</span>
                    <span className="points">{member.seasonPoints} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bet Slip Panel */}
      <BetSlipPanel
        balance={balance?.balance || 0}
        onPlaceBet={handlePlaceBet}
        isPlacing={placingBet}
      />
    </div>
  );
}

export default function Week() {
  return (
    <BetSlipProvider>
      <WeekContent />
    </BetSlipProvider>
  );
}
