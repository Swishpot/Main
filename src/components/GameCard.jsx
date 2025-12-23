import { formatOdds } from "../services/oddsApi";
import "../styles/GameCard.css";

export default function GameCard({ game, onClick, isSelected }) {
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const h2hMarket = game.markets?.find((m) => m.type === "h2h");
  const awayOdds = h2hMarket?.outcomes?.find((o) => o.name === game.awayTeam)?.odds;
  const homeOdds = h2hMarket?.outcomes?.find((o) => o.name === game.homeTeam)?.odds;

  return (
    <div
      className={`game-card ${game.isLocked ? "locked" : ""} ${
        isSelected ? "selected" : ""
      }`}
      onClick={onClick}
    >
      {game.isLocked && <div className="locked-badge">LOCKED</div>}

      <div className="game-time">{formatTime(game.commenceTime)}</div>

      <div className="game-matchup">
        <div className="team away">
          <span className="team-abbr">{game.awayTeamAbbr}</span>
          <span className="team-name">{game.awayTeam}</span>
          {awayOdds && <span className="team-odds">{formatOdds(awayOdds)}</span>}
        </div>

        <span className="vs">@</span>

        <div className="team home">
          <span className="team-abbr">{game.homeTeamAbbr}</span>
          <span className="team-name">{game.homeTeam}</span>
          {homeOdds && <span className="team-odds">{formatOdds(homeOdds)}</span>}
        </div>
      </div>

      {!game.isLocked && (
        <div className="game-action">
          <span>Tap to bet →</span>
        </div>
      )}
    </div>
  );
}
