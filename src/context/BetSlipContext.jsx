import { createContext, useContext, useState, useCallback } from "react";

const BetSlipContext = createContext(null);

export const useBetSlip = () => {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error("useBetSlip must be used within BetSlipProvider");
  }
  return context;
};

export const BetSlipProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [stake, setStake] = useState(0);

  const addSelection = useCallback((selection) => {
    setItems((prev) => {
      // Check if already exists
      const existingIndex = prev.findIndex(
        (item) =>
          item.gameId === selection.gameId &&
          item.marketType === selection.marketType &&
          item.selection === selection.selection
      );

      if (existingIndex >= 0) {
        // Remove if same selection clicked again
        return prev.filter((_, i) => i !== existingIndex);
      }

      // Remove conflicting selection from same market
      const filtered = prev.filter(
        (item) =>
          !(
            item.gameId === selection.gameId &&
            item.marketType === selection.marketType
          )
      );

      return [...filtered, selection];
    });
  }, []);

  const removeSelection = useCallback((index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearBetSlip = useCallback(() => {
    setItems([]);
    setStake(0);
  }, []);

  const isSelected = useCallback(
    (gameId, marketType, selection) => {
      return items.some(
        (item) =>
          item.gameId === gameId &&
          item.marketType === marketType &&
          item.selection === selection
      );
    },
    [items]
  );

  // Calculate totals
  const rawOdds = items.reduce((total, item) => total * item.odds, 1);

  // SGM correlation adjustment (same game multi)
  const isSGM = items.length > 1 && items.every((item) => item.gameId === items[0].gameId);
  const correlationFactor = isSGM ? calculateCorrelationFactor(items) : 1;
  const totalOdds = rawOdds * correlationFactor;
  const potentialPayout = stake * totalOdds;

  // Check for conflicts
  const conflicts = getConflicts(items);
  const hasConflict = conflicts.length > 0;

  const value = {
    items,
    stake,
    setStake,
    addSelection,
    removeSelection,
    clearBetSlip,
    isSelected,
    rawOdds,
    totalOdds,
    potentialPayout,
    isSGM,
    hasConflict,
    conflicts,
    isEmpty: items.length === 0,
  };

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
};

// Calculate correlation factor for SGMs
function calculateCorrelationFactor(items) {
  let factor = 1;
  const hasH2H = items.some((i) => i.marketType === "h2h");
  const hasSpread = items.some((i) => i.marketType === "spread");
  const hasTotal = items.some((i) => i.marketType === "total");
  const hasPlayerProps = items.some((i) => i.marketType.startsWith("player_"));

  // Positive correlation: H2H + Spread for same team
  if (hasH2H && hasSpread) {
    const h2hItem = items.find((i) => i.marketType === "h2h");
    const spreadItem = items.find((i) => i.marketType === "spread");
    if (h2hItem && spreadItem && h2hItem.selection === spreadItem.selection.split(" ")[0]) {
      factor *= 0.9; // Reduce odds for positive correlation
    }
  }

  // Player props with team performance
  if (hasPlayerProps && (hasH2H || hasSpread || hasTotal)) {
    factor *= 0.95;
  }

  return factor;
}

// Check for bet conflicts
function getConflicts(items) {
  const conflicts = [];

  // Group by game
  const gameGroups = {};
  for (const item of items) {
    if (!gameGroups[item.gameId]) {
      gameGroups[item.gameId] = [];
    }
    gameGroups[item.gameId].push(item);
  }

  for (const [gameId, gameItems] of Object.entries(gameGroups)) {
    // Check H2H conflicts (both teams to win)
    const h2hItems = gameItems.filter((i) => i.marketType === "h2h");
    if (h2hItems.length > 1) {
      conflicts.push({
        type: "h2h_conflict",
        message: "Cannot select both teams to win the same game",
      });
    }

    // Check total conflicts (both over and under)
    const totalItems = gameItems.filter((i) => i.marketType === "total");
    if (totalItems.length > 1) {
      const hasOver = totalItems.some((i) => i.selection.includes("Over"));
      const hasUnder = totalItems.some((i) => i.selection.includes("Under"));
      if (hasOver && hasUnder) {
        conflicts.push({
          type: "total_conflict",
          message: "Cannot select both Over and Under for the same total",
        });
      }
    }

    // Check player prop conflicts (same player, same prop, over and under)
    const playerProps = gameItems.filter((i) => i.marketType.startsWith("player_"));
    const playerGroups = {};
    for (const prop of playerProps) {
      const key = `${prop.playerName}-${prop.marketType}`;
      if (!playerGroups[key]) {
        playerGroups[key] = [];
      }
      playerGroups[key].push(prop);
    }

    for (const [key, props] of Object.entries(playerGroups)) {
      if (props.length > 1) {
        conflicts.push({
          type: "player_prop_conflict",
          message: `Cannot select both Over and Under for ${props[0].playerName}`,
        });
      }
    }
  }

  return conflicts;
}
