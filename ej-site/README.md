# IG site (mock)

Static frontend prototype built from the "IG.com Frontend Replica" design export.

## Run

```bash
npm start            # serves ./public at http://localhost:3000
PORT=8080 npm start  # custom port
```

No install step. The pages load React 18.3.1 and Babel from unpkg and fonts from Google Fonts, so an internet connection is required.

## Pages

| Page | File |
|---|---|
| Landing (main, `/` redirects here) | `public/IG Landing v2.dc.html` |
| Landing (earlier version) | `public/IG Landing.dc.html` |
| Demo account sign-up | `public/IG Demo Account.dc.html` |
| Live account sign-up / log in | `public/IG Live Account.dc.html` |
| My account dashboard | `public/IG My Account.dc.html` |

Sign-up data is kept only in the browser's `localStorage` (`ej_user`, `ej_acct`); there is no backend.
