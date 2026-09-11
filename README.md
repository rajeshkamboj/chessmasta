# ChessMasta

Live app: https://chessmasta.vercel.app/

A personal chess coaching application built with Next.js, PostgreSQL, and Drizzle ORM. It gives users a way to review games, track mistakes, practice tactical exercises, and study opening repertoires in a lightweight coaching workflow.

## Features

- Play and review chess games
- Track mistakes and categorize them by pattern
- Generate training exercises from mistakes
- Learn opening repertoire lines
- Analyze positions and game progress over time
- Built with a PostgreSQL-backed data model

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- PostgreSQL
- Drizzle ORM
- Chess.js
- Stockfish integration

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL database

## Local Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the project root:

```env
DATABASE_URL=postgresql://username:password@host:5432/database_name
```

4. Run the development server:

```bash
npm run dev
```

5. Open the app in your browser:

```text
http://localhost:3000
```

## Production Build

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Drizzle and the app data layer |

## Project Structure

```text
src/
  app/
    api/
    games/
    mistakes/
    openings/
    otb/
    play/
    train/
  components/
  db/
  lib/
```

## Notes

This project connects to PostgreSQL at runtime. If `DATABASE_URL` is not configured, the app will fail to start because the database client is initialized in `src/db/index.ts`.

## License

This project is for personal and educational use.
