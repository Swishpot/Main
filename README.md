# SwishPot Web

NBA prediction league web app - compete with friends using real bookmaker odds!

## Features

- **Weekly Competitions**: $1,000 SwishBucks per week to bet with
- **Real Odds**: Live odds from The Odds API
- **Multiple Bet Types**: Singles, Same Game Multis (SGMs), and parlays
- **Player Props**: Points, rebounds, assists, 3-pointers, and PRA
- **Leaderboards**: Weekly and season-long standings
- **League System**: Create or join leagues with invite codes

## Tech Stack

- React + Vite
- Appwrite (Backend/Database)
- The Odds API (Live odds)
- React Router (Navigation)

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Environment Variables

Create a `.env` file with your credentials (see `.env.example`):

```
VITE_APPWRITE_ENDPOINT=your_endpoint
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_DATABASE_ID=your_database_id
VITE_ODDS_API_KEYS=key1,key2,key3
VITE_BALLDONTLIE_API_KEY=your_api_key
```

## Deployment to GitHub Pages

1. Push to GitHub
2. Go to Settings > Secrets and variables > Actions
3. Add these secrets:
   - `VITE_APPWRITE_ENDPOINT`
   - `VITE_APPWRITE_PROJECT_ID`
   - `VITE_DATABASE_ID`
   - `VITE_ODDS_API_KEYS`
   - `VITE_BALLDONTLIE_API_KEY`
4. Go to Settings > Pages
5. Set Source to "GitHub Actions"
6. Push to `main` branch to trigger deployment

## Appwrite Setup

Ensure your Appwrite project has:
- Web platform added with your GitHub Pages domain
- These collections: `users`, `leagues`, `league_members`, `weeks`, `week_balances`, `bets`, `bet_legs`, `games_cache`
