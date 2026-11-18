# TDTU Innovation demo (issues #1–#4)

This branch starts from the latest course-project tree and adds parent accounts, verified guardian links, public tutor profiles, and transactional lesson booking. The demo uses a separate local database; do not point the seed at production.

Baseline: course repository `ThanhVu6102/tutoring-platform` commit `b97c601f179c74b9fcd4a3eb8873c716fb7e814e`; copied byte-for-byte into contest `tdtu_innovation` commit `eb7f3aa`. At sync time contest `main` was `666601e` and `develop` was `a4e9f50`; they were intentionally left unchanged because competition PRs target `tdtu_innovation`. The competition repository is `ztdayyyyyyyyyy2112/eklasses.id.vn`. The course URL `https://eklasses.id.vn` currently shows the course build, not this competition demo.

Verified local environment: Node.js 24.21.0, npm 11.19.0, MongoDB Server 9.0 single-node replica set, React 18, Create React App 5, Express 4, Mongoose 7. Existing `vercel.json` deploys the combined React/Express app but requires separate deployment credentials and a transaction-capable MongoDB connection for the new booking flow.

## Run locally

1. Install MongoDB and run a single-node replica set named `eklassesDemo` on `127.0.0.1:27018`. Transactions require a replica set. For a fresh instance, create a separate data directory and run `mongod --dbpath <demo-data-dir> --port 27018 --replSet eklassesDemo --bind_ip 127.0.0.1`; initialize once with `rs.initiate()` in mongosh.
2. Copy `backend/.env.example` to `backend/.env`. Generate a random `JWT_SECRET` with at least 32 bytes, and set a local `DEMO_PASSWORD` of 8–72 bytes. Never commit either value.
3. Run `npm ci --prefix backend` and `npm ci --prefix frontend`.
4. Run `npm run seed:demo --prefix backend` twice if desired; the second run must not create duplicates.
5. Start `npm start --prefix backend`. For the older Create React App dev server on Windows, start the frontend in PowerShell with `$env:HOST='127.0.0.1'; $env:DANGEROUSLY_DISABLE_HOST_CHECK='true'; npm start --prefix frontend`. Binding to loopback limits access to this machine. Open `http://127.0.0.1:3000` and verify `http://127.0.0.1:5000/api/health`.
6. With both servers running, execute `npm run test:demo --prefix backend` for an HTTP/MongoDB smoke test of the role boundaries and booking transaction.

The seed creates these fake accounts (all share your local `DEMO_PASSWORD`): `admin.demo@example.test`, `math.tutor@example.test`, `english.tutor@example.test`, `student.demo@example.test`, `parent.demo@example.test`. It also creates a verified parent–student link, two published tutor profiles, a class, session, and quiz. The public tutor search only includes active, approved teachers with published profiles. Seed refuses non-local MongoDB URLs and any database other than `eklasses-tdtu-demo`.

To reset the demo, stop both app servers, drop only the local `eklasses-tdtu-demo` database on port 27018, then run the seed again. Check the selected database name before dropping it. Keep the replica set data directory outside the Git checkout.

## Demo flow

1. Log in as parent. The parent dashboard shows the linked student and the two tutor cards. Filter by subject, grade, or teaching mode.
2. Select a tutor and submit a 30–180 minute future slot. A conflicting slot is refused. The request appears as `pending`.
3. Log in as the targeted tutor. Open **Hồ sơ gia sư & lịch dạy**, inspect the request, and accept it. One transaction creates a class and session, enrolls the student, and marks the booking `accepted`.
4. Log in as the student. The new class is visible. Parent–student links are verified by the local seed/admin; there is no self-link form in this demo.
5. Submit a quiz as the student and grade it as the responsible teacher. Return to the parent dashboard, select **Xem tiến bộ** next to the child, then reload the report. Submitted work is pending; only graded scores appear in the chart. See [parent progress contract and QA](PARENT_PROGRESS.md). This step does not imply the full #6 UI acceptance/video has been completed.

## API overview

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Registers `student`, `teacher`, or `parent`; teacher waits for admin approval. |
| `GET /api/guardians/children` | Parent | Returns only students with verified links to this parent. |
| `GET /api/guardians/children/:studentId/progress` | Linked parent | Read-only session/quiz report; latest 50 of each, all-history totals, no answers/drafts/internal notes. |
| `GET /api/tutors`, `GET /api/tutors/:id` | Public | Lists public profile fields for active, approved teachers only. |
| `GET /api/tutors/me`, `PUT /api/tutors/me` | Teacher | Reads or edits own tutor profile. |
| `GET /api/bookings` | Parent or teacher | Lists own bookings only. |
| `POST /api/bookings` | Parent | Books for a verified child using an idempotency key. |
| `POST /api/bookings/:id/decision` | Owner parent or targeted teacher | Cancels, rejects, or accepts a pending request. |

Acceptance depends on MongoDB transactions. Do not use a standalone MongoDB process for this demo. Account role and status are checked from the database for every authenticated request.
