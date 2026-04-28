# Exit Protocol

A real-time classroom exit ticket tool. Students submit one sentence about what they learned, and the responses appear live as a word cloud on the teacher's screen.

## Features

- **Live word cloud** — updates instantly via WebSocket as students submit
- **Two themes** — Matrix (dark/green) and Light, switchable per-user and persisted in the browser
- **Admin dashboard** — password-protected panel to monitor responses and reset between classes
- **Session history** — previous sessions are saved automatically on reset and can be reviewed later
- **Export** — download responses as `.txt`, `.csv`, or `.xlsx`

## Project structure

```
exit-protocol/
├── public/
│   ├── index.html            # Student-facing page
│   ├── admin-login.html
│   ├── admin-dashboard.html
│   └── admin-session.html
├── infrastructure/
│   └── docker/
│       └── Dockerfile
├── server.js
└── package.json
```

## Getting started

### Run locally

```bash
npm install
npm start
```

The server starts on port `3000`. Share your local IP with students, e.g. `http://192.168.x.x:3000/`.

### Run with Docker

```bash
sudo docker rm -f exit-ticket 2>/dev/null
sudo docker build -f infrastructure/docker/Dockerfile -t exit-ticket .
sudo docker run -d --name exit-ticket -p 3000:3000 --restart unless-stopped exit-ticket
```

## Configuration

All settings are controlled via environment variables:

| Variable         | Default              | Description                |
|------------------|----------------------|----------------------------|
| `ADMIN_USER`     | `admin`              | Admin username             |
| `ADMIN_PASS`     | `lektion123`         | Admin password             |
| `SESSION_SECRET` | `exit-ticket-secret` | Secret for session cookies |
| `PORT`           | `3000`               | Port the server listens on |

Pass them to Docker with `-e`:

```bash
sudo docker run -d --name exit-ticket -p 3000:3000 \
  -e ADMIN_USER=teacher \
  -e ADMIN_PASS=mypassword \
  -e SESSION_SECRET=somethinglong \
  --restart unless-stopped exit-ticket
```

## Usage

| URL                  | Who      | Purpose                            |
|----------------------|----------|------------------------------------|
| `/`                  | Students | Submit a sentence, view word cloud |
| `/admin`             | Teacher  | Login to the admin panel           |
| `/admin/dashboard`   | Teacher  | Live view, reset, export           |

> **Note:** Data is stored in memory and resets when the server restarts. Use the export feature to save responses before stopping the container.
