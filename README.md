# Corporate Startup Tutor

An AI Agent Tutor web app for university entrepreneurship courses. Each student
group gets a shared dashboard where they can run AI-generated class reflections,
curate fortnightly corporate-startup news updates, and keep a running log of
free-form notes — all visible to the instructor in a single view.

Built with Next.js, Prisma/SQLite, and Google Gemini.

## Features

- **Group dashboards via shareable links** — create a group, share the
  `/group/<slug>` link; no accounts needed.
- **Class Reflection** — the group describes their progress; Gemini returns
  structured key points plus one open question to push their thinking.
- **Fortnightly News Update** — two modes, controlled by the `NEWS_MODE` env var:
  - `grounded` — Gemini searches the web with Google Search grounding and
    summarizes real corporate-startup collaboration news from the last two weeks.
  - `manual` (default) — students paste news content (e.g. LinkedIn posts,
    company announcements); Gemini structures it into source / summary /
    why-it-matters entries, honestly labeled as *manually curated*.
- **Student notes** — free-form notes saved to the group feed (no AI call).
- **Instructor view** — `/instructor` lists every group with entry counts and
  links into its dashboard.
- **Append-only feed** — every entry and AI prompt/response pair is logged
  chronologically; nothing is edited or deleted.

## Tech stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js (App Router, TypeScript, Tailwind CSS) |
| Database   | SQLite via Prisma ORM                          |
| LLM        | Google Gemini (`gemini-3.6-flash`) via `@google/generative-ai` |

## Getting started

1. **Clone and install dependencies**

   ```bash
   npm install
   ```

2. **Create your env file** — copy the example and fill in a real API key:

   ```bash
   cp .env.example .env
   ```

   Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/apikey).

3. **Create and migrate the database**

   ```bash
   npx prisma migrate dev
   ```

4. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), create a group, and
   share the `/group/<slug>` link with your students.

## Environment variables

| Variable         | Required | Values                                        | Description                                                                                                                                                  |
| ---------------- | -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY` | Yes      | API key string                                | Google AI Studio key used for all Gemini calls. Get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).                                   |
| `DATABASE_URL`   | Yes      | `file:./dev.db`                               | SQLite database path used by Prisma. The file is created by `npx prisma migrate dev`.                                                                          |
| `NEWS_MODE`      | No       | `manual` (default) or `grounded`              | How the Fortnightly News Update sources content. `grounded` uses Google Search grounding and **requires a Gemini API tier with grounding quota**; `manual` parses student-pasted news text. |

## Known limitations

- **No authentication.** Anyone who has a group's `/group/<slug>` link can post
  notes and trigger AI calls on its behalf. Treat slugs as bearer tokens — don't
  post them publicly.
- **SQLite only.** The database is a local file, so the app is not ready for
  serverless hosting (Vercel etc.) as-is. Swap the Prisma datasource to
  Postgres/MySQL for a hosted deployment.
- **Grounding mode is tier-dependent.** Google Search grounding requires a
  Gemini API tier/quota that includes it; on a free key it may return quota
  errors. Use `NEWS_MODE=manual` in that case.
- **Manual news mode is only as good as its input.** It structures whatever
  students paste — it never searches the web, and unverifiable URLs are
  stripped rather than shown.
