# Pulseboard Server

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Express](https://img.shields.io/badge/Express.js-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

Pulseboard Server is the high-performance backend engine powering **Pulseboard**, an engineering intelligence platform designed to transform raw repository activity into actionable signals. It serves as the decision-making layer for modern engineering teams, helping CTOs and VPs of Engineering identify bottlenecks, track velocity, and optimize delivery.

---

## 🚀 High-Level Architecture

The server is built with a focus on **data integrity**, **performance**, and **actionability**. It doesn't just store data; it analyzes it in real-time to provide insights.

### Core Value Proposition
- **From Metrics to Decisions**: Instead of just showing "number of PRs", the engine identifies *why* a team is slowing down (e.g., long review times, stale PRs).
- **Automated Triage**: Surfacing critical issues through an "Action Center" pipeline.
- **Velocity Tracking**: Calculating cycle time distribution and throughput using optimized database queries.

---

## 🛠 Low-Level Design (LLD)

### 1. Data Ingestion Pipeline
- **Incremental Sync**: Uses background cron jobs (`node-cron`) to periodically sync with the GitHub API.
- **Idempotent Operations**: Ensures that repeated syncs do not duplicate data, maintaining a consistent state of the engineering fleet.
- **Entity Relationship**: Managed via **Prisma ORM** with a schema optimized for time-series analysis (PR creation, merge, and closing events).

### 2. Engineering Intelligence Engine (`MetricsService`)
- **Cycle Time Calculation**: Aggregates time-to-merge metrics, bucketing them into actionable distributions (<1d, 1-3d, 7d+).
- **Health Signal Logic**: Implements sophisticated filtering to detect:
    - **Stale PRs**: Open for >3 days without activity.
    - **High-Risk PRs**: Large diffs or missing reviewers.
    - **Developer Bottlenecks**: Identifying blocked contributors to prevent burn-out or silos.
- **Aggregate Analytics**: Efficiently computes PR distributions (Open vs Merged vs Closed) using complex PostgreSQL aggregations.

### 3. Security & Scalability
- **JWT Authentication**: Secure stateless authentication flow.
- **Rate Limiting**: Protected public endpoints using `express-rate-limit` to prevent API abuse.
- **Structured Error Handling**: Centralized error management to ensure no silent failures in production.

---

## 📊 Key API Signals

| Endpoint | Signal Provided | Decision Supported |
| :--- | :--- | :--- |
| `GET /api/metrics/health` | Action Center items, contributors | "What needs my attention right now?" |
| `GET /api/metrics/distribution` | State & Cycle Time buckets | "Is our pipeline healthy or clogged?" |
| `GET /api/metrics/drilldown` | Filtered PR lists | "Which specific PRs are blocking us?" |

---

## 💻 Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript (Strict Mode)
- **Framework**: Express.js (v5)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Scheduling**: Node-cron
- **Validation**: Zod / Custom Middleware

---

## 🛠 Getting Started

1. **Clone the repo**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Setup Environment**:
   Create a `.env` file with `DATABASE_URL` and `JWT_SECRET`.
4. **Run Migrations**:
   ```bash
   npx prisma migrate dev
   ```
5. **Start Dev Server**:
   ```bash
   npm run dev
   ```

---

## 📈 Future Roadmap
- [ ] AI-driven PR summary generation.
- [ ] Predictive "Bottleneck" detection based on historical velocity.
- [ ] Advanced team-level benchmarking.

---
*Pulseboard Server — Engineering metrics you can actually act on.*
