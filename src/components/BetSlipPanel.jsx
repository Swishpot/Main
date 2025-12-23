import { useState } from "react";
import { useBetSlip } from "../context/BetSlipContext";
import { formatOdds } from "../services/oddsApi";
import "../styles/BetSlipPanel.css";

export default function BetSlipPanel({ balance, onPlaceBet, isPlacing }) {
  const betSlip = useBetSlip();
  const [isExpanded, setIsExpanded] = useState(false);

  const formatCurrency = (amount) => {
    return `$${(amount || 0).toLocaleString("en-AU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const handleStakeChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    betSlip.setStake(Math.min(value, balance));
  };

  const quickStakes = [10, 25, 50, 100, 250];

  if (betSlip.isEmpty) {
    return null;
  }

  return (
    <div className={`bet-slip-panel ${isExpanded ? "expanded" : ""}`}>
      <div className="bet-slip-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="bet-slip-summary">
          <span className="bet-count">
            {betSlip.items.length} selection{betSlip.items.length !== 1 ? "s" : ""}
            {betSlip.isSGM && " (SGM)"}
          </span>
          <span className="total-odds">{formatOdds(betSlip.totalOdds)}</span>
        </div>
        <button className="expand-btn">{isExpanded ? "▼" : "▲"}</button>
      </div>

      {isExpanded && (
        <div className="bet-slip-content">
          {/* Conflicts */}
          {betSlip.hasConflict && (
            <div className="conflicts">
              {betSlip.conflicts.map((conflict, i) => (
                <div key={i} className="conflict-message">
                  ⚠️ {conflict.message}
                </div>
              ))}
            </div>
          )}

          {/* Selections */}
          <div className="selections">
            {betSlip.items.map((item, index) => (
              <div key={index} className="selection-item">
                <div className="selection-info">
                  <span className="selection-game">{item.gameDescription}</span>
                  <span className="selection-pick">{item.selection}</span>
                </div>
                <div className="selection-actions">
                  <span className="selection-odds">{formatOdds(item.odds)}</span>
                  <button
                    className="remove-btn"
                    onClick={() => betSlip.removeSelection(index)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Stake Input */}
          <div className="stake-section">
            <div className="stake-header">
              <label htmlFor="stake">Stake</label>
              <span className="balance-info">Balance: {formatCurrency(balance)}</span>
            </div>

            <div className="stake-input-wrapper">
              <span className="currency-symbol">$</span>
              <input
                id="stake"
                type="number"
                value={betSlip.stake || ""}
                onChange={handleStakeChange}
                placeholder="0"
                min="0"
                max={balance}
              />
            </div>

            <div className="quick-stakes">
              {quickStakes.map((amount) => (
                <button
                  key={amount}
                  className="quick-stake-btn"
                  onClick={() => betSlip.setStake(Math.min(amount, balance))}
                  disabled={amount > balance}
                >
                  ${amount}
                </button>
              ))}
              <button
                className="quick-stake-btn max"
                onClick={() => betSlip.setStake(balance)}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Payout */}
          <div className="payout-section">
            <div className="payout-row">
              <span>Total Odds</span>
              <span>{formatOdds(betSlip.totalOdds)}</span>
            </div>
            <div className="payout-row potential">
              <span>Potential Payout</span>
              <span>{formatCurrency(betSlip.potentialPayout)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="bet-slip-actions">
            <button className="btn-clear" onClick={betSlip.clearBetSlip}>
              Clear All
            </button>
            <button
              className="btn-place-bet"
              onClick={onPlaceBet}
              disabled={
                isPlacing ||
                betSlip.hasConflict ||
                betSlip.stake <= 0 ||
                betSlip.stake > balance
              }
            >
              {isPlacing
                ? "Placing..."
                : `Place Bet ${formatCurrency(betSlip.stake)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
