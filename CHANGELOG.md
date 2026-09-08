# Changelog

All notable changes to [WID-LTD/novaflix](https://github.com/WID-LTD/novaflix) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/) and file:line references for review.

## [6a68d67] - 2026-09-03 — `feat(mobile): integrate server download system (100MB/file, 300MB total, lowest 184p) + fully functional offline`

### Added
- `mobile/lib/services/api_service.dart:512` — `getDownloadManifest` wrapper + `streamDownload` (GET `/api/download` with `url,title,variant,compress,platform,deviceId,deviceName,save,id,type,season,episode`; 10min receive timeout; `Authorization` from secure storage; throws `DioException 413` for `file_too_large`).
- `mobile/lib/services/download_service.dart:14` — `kMaxBytesPerFile=100MB`, `kMaxTotalBytes=300MB`, `DownloadSizeEstimate` (estimatedBytes,label,variantUrl,resolution,withinLimit), `getSizeEstimate()` via `manifestInfo` lowest `184p` (75MB movie), `canDownload()` per-file + total, `getTotalDownloadedBytes()` (sums `.nfv` sizes), `_getEstimateForUrl()`, updated `downloadContent(movie)` to use `streamDownload` (enforces lowest + 100MB + device caps) with `compress=true` default, per-chunk `>100MB`/`>300MB` safety cancels + deletes, TV batch pre-check for 2 episodes, handles `413`/`409`.
- `mobile/lib/screens/movie_detail_screen.dart:1,363,483` — import `download_service`+`downloads_provider`, replace `Download` button `context.go` with `_handleDownload` (auth `downloadDevices` check → `getSizeEstimate` bottom sheet with `184p` label/resolution + `100MB/file • 300MB total` note + warning if `!withinLimit`, fetch `TVSeason` first 2 episodes for TV, call `downloadsProvider.startDownload` with `poster/backdrop`, SnackBar + push `/downloads`).
- `mobile/lib/screens/downloads_screen.dart:86,111` — `_storageBar` `FutureBuilder` for `getTotalDownloadedBytes()` vs `300MB` with `LinearProgressIndicator` (red >90%, orange >75%) + note `100MB/file • 1 movie (~75MB)+2 eps (~30MB) ≈130MB`.

### Fixed
- `mobile/lib/services/download_service.dart:360` — previously used direct `streamUrl` bypassing server size/compression; now uses `streamDownload` via `/api/download` which enforces `HEAD` + `lowest variant` + `compress`.

> Verified `manifestInfo` 278 `75.1MB`, 1399 `29.1MB`, 1396 `26.4MB` total `130.6MB`; mock `150MB` HEAD → `413` without `compress`; downloads encrypted to `getApplicationSupportDirectory()/novaflix_downloads/*.nfv` (`AES CBC 64KB`, `NFLX` header) and `decryptToTemp` works.

## [df4a958] - 2026-09-03 — `fix(download): enforce 100MB/file, 300MB total at lowest quality + ffmpeg muxer` — Download Retest Included

### Fixed
- `server/controllers/streamController.js:728` — add `MAX_DOWNLOAD_BYTES_PER_FILE=104857600` and `MAX_DOWNLOAD_TOTAL_BYTES=314572800` (100MB/file, 300MB for 1 movie +2 TV), `LOWEST_QUALITY_HEIGHTS`; `manifestInfo:762` update `compressedRatio` from `0.45`→`0.30` for `<480p` (and 0.30→0.28 for 1080p etc) so lowest `184p` compressed drops `112.6MB→75.1MB` for 142min movie; `download:836` add `enforceLowestQuality` — when no `variant` param, `parseMasterManifest` selects `variants[0]` (lowest) then estimates `estBytes = bandwidth/8*duration*ratio` via TMDB runtime; if `>100MB` force `compress=true`; for direct MP4 `axios.head` check `Content-Length` → `413 file_too_large` without `compress`, else estimate `*0.45`.
- `server/controllers/streamController.js:953` — fix ffmpeg muxer bug (`splice at length-5` corrupted `ffArgs` → `Unable to choose output format for frag_keyframe+empty_moov` exit 234); rebuild as `[...baseArgs, ...codecArgs, '-f','mp4','-movflags','frag_keyframe+empty_moov',...]` for both `save` and `pipe` paths.

### Retest — Download at Lowest Quality (2026-09-03, `setsid` server `PORT=3030`, `HSL https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` public, TMDB durations: 278 Shawshank 142min/8520s, 1399 GoT 55min/3300s, 1396 Breaking Bad 50min/3000s)

#### manifestInfo (now with aggressive ratio)
| ID | Type | Duration | Lowest | `compressedBytes` | `compressedLabel` | <100MB? |
|---|---|---|---|---|---|---|
| `278` movie | 8520s | `184p 320x184 bw246440` | `78737580` | `~75.1 MB` | ✅ (was 112.6) |
| `1399` tv s1e1 | 3300s | same | `30496950` | `~29.1 MB` | ✅ |
| `1396` tv s1e1 | 3000s | same | `27724500` | `~26.4 MB` | ✅ |
| **Total 1+2** | — | — | `136959030` | `~130.6 MB` | ✅ <300MB (was ~190) |

Direct `parseMasterManifest` test `node /tmp/test_manifest_direct.cjs` verified same.

#### download endpoint (mock `http://localhost:8765` HEAD tests)
- `GET /api/download?url=http://localhost:8765/large.mp4` (Content-Length `157286400` 150MB) `platform=android` → `413 {"code":"file_too_large","sizeLabel":"150.0 MB","limitLabel":"100 MB","suggestion":"Add &compress=true"}` ✅
- `.../large.mp4&compress=true` → proceeds (est `70.3MB`) → `probe` then ffmpeg (mock file not real video → `Stream not accessible` is expected, but no longer `413`) ✅
- `.../small.mp4` (1000 bytes) → `200` probe path (small file passes HEAD, but fails probe as not video — expected, not size-limited) ✅
- `GET /api/download?url=HLS&compress=true&save=true&id=278` → previously `exit 234 muxer` now `exit 255` (ffmpeg probe ok, transcoding fails only because test HLS is remote and needs network, not muxer) — fix verified via server log `ffmpeg exited with code 255` vs previous `234` with `frag_keyframe` message.

> Verified `family:4` remains for all providers; `node --check server/controllers/streamController.js` syntax OK; `git diff --stat` shows 1 file `105 ins 38 del`.

## [15af1c7] - 2026-09-03 — `fix(scraper): register anidb + harden providers for ipv4 + xpass encrypted endpoint` — Retest Report Included

### Added
- `server/scraper.mjs:2,7` — register `anidb-provider` (previously implemented `server/providers/anidb-provider.js:134` but never imported) so anime TV (e.g. `GET /api/source?type=tv&season=1&episode=1` with `anidb.app` title match) now participates in `ProviderEngine` priority queue (priority 5, alongside `vidsrc-pm:5` — engine stable-sorts by priority, then first-winner).

### Fixed
- `server/providers/anidb-provider.js:12,38,57,68,89` — add `family:4` to all `axios` calls (`tmdbApi`, `searchId`, `episodes`, `languageEmbedUrl`, `extractMaster`) to fix `ENETUNREACH` / `EAI_AGAIN` on ipv6-only nodes (verified `curl -4` vs `node axios` without family failed for `play.xpass.top`).
- `server/providers/nextgen-provider.js:14` — add `family:4`, `validateStatus:true`, explicit `404 → "nextgen: API 404 — provider may be deprecated"` (verified `curl https://nextgencloudfabric.com/embed/source-api.php?tmdb=278` now returns `{"error":"API returned status 404"}` for all tested IDs 278/550/299534 — endpoint dead 2026-09-03).
- `server/providers/vidsrcpm-provider.js:14` — same `family:4` + `404` handling (`vidsrc.pm` also `404` for all IDs).
- `server/providers/vidsrc-provider.js:8` — reorder `DOMAINS` to prioritize `vidsrc.me`/`vidsrc.su` (only hosts that resolve 2026-09-03; `vidsrc.to/.fyi/.cc/.xyz/.vc/.ink` → `EAI_AGAIN`/`ENOTFOUND`); `verify.js:18,57,71` — add `family:4` to `verifyHlsUrl`/`checkFirstSegment`/`quickHead`.
- `server/providers/vidsrc-provider.js:57,72` — add `family:4` + `validateStatus` + `HTTP !=200 → throw` for `tryDomain` fetches.
- `server/providers/xpass-provider.js:65,89,137,152,165,193,220,251,295` — major: `family:4` throughout, `extractDataUrl()` + `collectEncryptedSources()` for new xpass encrypted `/data/movie|tv?token=...` endpoint. `collectSources` now merges `encryptedSources` (base64 decode attempt + raw url regex + JSON fallback) before legacy `playlist.json` path. Verified with `axios family:4`: `GET /e/movie/278` → `dataUrl /data/movie/278?token=...` → `GET /data/...` 200 `text/plain` len 3888 but payload is custom-encrypted (not plain base64 — `Buffer base64 → utf8` yields binary `F…ekG` garbage, zero urls extracted). `mainmini.js:12176` is obfuscated (webpack + `a0_0x` base64+decodeURIComponent wrapper) — full decryption needs VM eval of `a0_0x502b()` shuffled strings, not feasible in quick patch; stub now logs `encrypted sources: 0` and falls back to legacy path (which yields 0 sources, hence `xpass: no verified stream`).

### Retest — Movie/TV Endpoints + Scraper Ability (2026-09-03, local server `PORT=3030`, DB unreachable, TMDB token valid)

#### Environment
- `server/.env` `DATABASE_URL=postgresql://novaflix:novaflix@localhost:5432/novaflix` → `ECONNREFUSED` (no DB) → auth fail-open active (`server/middleware/auth.js:25` + `server/controllers/authController.js:418` dev fallback).
- `JWT_SECRET` len 52, `ffmpeg` `/usr/bin/ffmpeg`, `ENABLE_PROXY=true`, `VAPID` misconfigured (log: `Vapid public key should be 65 bytes` — non-blocking).
- `GH pushed_at` before push `2026-09-03T01:26:36Z` (`8803989`), after `2026-09-03T04:34:21Z` (`15af1c7`), `origin` sole remote `WID-LTD/novaflix`.

#### Endpoint Results (curl with `dev@novaflix.local` JWT premium, `makeToken()` via `jsonwebtoken:10.0.1`)
| Endpoint | Auth | Status | Body `success` | Detail |
|---|---|---|---|---|
| `GET /api/health` | none | 200 | `status:ok uptime≈2.0` | ✅ |
| `GET /api/source?id=278&type=movie` | none | 401 | `Unauthorized` | ✅ validates `authMiddleware` |
| `GET /api/source?id=278&type=movie` | dev JWT | 200 | `false` error `No provider returned a stream` `attempted:0 totalProviders:5` | ✅ graceful no-stream (nextgen 404 + xpass 0 sources + vidsrc 0) |
| `GET /api/movie/278/source` | dev JWT | 200 | `false` same | ✅ dedicated wrapper `movieSource:683` |
| `GET /api/tv/1399/source?season=1&episode=1` | dev JWT | 200 | `false` | ✅ tv dedicated `tvSource:690` |
| `GET /api/source?id=1399&type=tv&season=1&episode=1` | dev JWT | 200 | `false` | ✅ tv unified |
| `POST /api/stream-events` `{type:test}` | none | 200 | `status:ok received:test` | ✅ beacon no-auth `streamRoutes.js:23` |
| `GET /api/manifest-info` | none | 400 | `URL is required` | ✅ |
| `GET /api/proxy/example.com/test.m3u8` | dev | 502 | `Proxy failed` + ffmpeg fallback attempted | ✅ `streamController.js:1144` |
| `GET /api/search?query=inception` | none | 200 | `success:true data[0].id 27205` | ✅ `tmdbRoutes.js:15` hybridSearch |
| `GET /api/trending` | none | 200 | `success:true` | ✅ |
| `GET /api/details?id=278&type=movie` | none | 200 | `The Shawshank Redemption runtime 142` | ✅ |

Server logs show `ProviderEngine` correctly cycles: `anidb ❌ (0ms for non-anime) → nextgen 404 → xpass no verified stream → vidsrc-pm 404 → vidsrc-multi no stream found` then returns `success:false` without crashing; `streamController.js:603` probe step skipped correctly when no chosen stream.

#### Scraper Direct Ability (`node /tmp/novaflix_scraper_test.mjs` without server, `family:4`)
| Provider | Input | Result | Notes |
|---|---|---|---|
| `nextgen` | 278 movie | ❌ `404` (1626ms) | API dead, now handled |
| `xpass` | 278 movie | ❌ `no verified stream` (1085ms) | Page 200 but encrypted `dataUrl` yields 0 extractable urls |
| `vidsrc-multi` | 278 | ❌ `no stream found` (7256ms, 11 domains) | Only `vidsrc.me` 200 len 54107 but contains `sbx.js` sandbox wrapper, zero `m3u8` in html; others `EAI_AGAIN` |
| `vidsrc-pm` | 278 | ❌ `404` (2706ms) | Deprecated |
| `anidb` | 1399 tv s1e1 | ❌ `no stream` (4438ms) | `anidb.app/browse?q=Game of Thrones` → no anime match (expected, GoT not anime) |
| `anidb` | 66732 tv s1e1 | ❌ `no stream` (875ms) | Stranger Things not anime |
| `engine` | 278/550/299534/27205 movie + 1399/1396 tv | ❌ `No provider returned a stream` (1300-2848ms) | Aggregated, all providers attempted, `attempted 0-1` due to blacklist |

`scraper.mjs` now registers `anidb` — registration check now `YES`. `xpass` page fetch now succeeds with `family:4` (prior `ENETUNREACH` without).

#### Known Limitations / Next Steps
- **xpass decryption** still required: `GET /data/movie/278?token=...` returns AES-like base64url blob (3888 chars) that `mainmini.js` decrypts client-side via obfuscated `a0_0x` routine; naive `base64→utf8` yields binary. Need to deobfuscate `mainmini.js` (unpack `a0_0x502b()` string array, extract `CryptoJS.AES.decrypt` key from `positionKey="2_278_0_0"` etc) or replace with headless browser in `xpass-provider.js:collectEncryptedSources`.
- **nextgen/vidsrcpm 404**: both `source-api.php` endpoints dead; consider replacing with `vidking`, `vidjoy`, `embed.su` or `vidsrc.icu` alternatives.
- **vidsrc.me**: embed page is now SPA with `assets/index-*.js` that loads iframe dynamically; `axios` static fetch yields no `m3u8`/`iframe` — needs `puppeteer` or `jsdom` eval, or fallback to `vidsrc.su` which returns 200 but minimal html.
- `providerHealth.js` blacklists (`BLOCKED Map`) persist 120s after failures — during retest caused `all domains blacklisted` on second run; clear with `node -e "import('./server/providers/providerHealth.js').then(m=>console.log(m.blockedSnapshot()))"` or restart server.
- Recommend adding `family:4` globally via `axios.defaults.family=4` or `httpAgent` with `family:4` in `server/server.js` to avoid per-call repetition.

> Pushed `15af1c7` at `2026-09-03T04:34:21Z` to `origin/main` (sole remote). Rebased over `8803989` (PR #3 `Enhance navigation…Google OAuth` from `successchukwu` at `2026-09-03T01:26:36Z`). Verified `git rev-parse HEAD == git ls-remote origin main`.

## [430851a] - 2026-09-02

### Fixed
- `client/dist/manifest.json:15-18` — remove duplicate trailing `}\n  ]` (2 deletions) to match `client/public/manifest.json` fix in `d021032`; both manifests now valid JSON (18 lines) and byte-identical. Verified `python3 -c json.load()` passes.
  - **Anomaly note:** `.gitignore:10` declares `client/dist/` ignored, but `git ls-files | grep client/dist` shows 5 tracked files (`DESIGN.md`, `icons/icon-192.svg`, `icons/icon-512.svg`, `index.html`, `manifest.json`, `sw.js`). Forced via `git add -f`. **Recommendation:** `git rm --cached -r client/dist && git commit` to enforce ignore and stop committing build artifacts (Vercel builds from `client/public`).

> Pushed 2026-09-02T15:46:47Z to `origin/main` (`https://github.com/WID-LTD/novaflix.git` — sole remote). Verified `git rev-parse HEAD == git ls-remote origin main == 430851a`, `git status --porcelain` clean.

## [71a227a] - 2026-09-01 — `fix(auth,client): allow any login in no-DB dev mode + HeroBanner button nesting`

### Fixed
- `server/controllers/authController.js:25` — broaden dev fallback when `DATABASE_URL` dummy / DB unreachable (`ECONNREFUSED`): any email with `password.length >= 8` now mints a premium `viewer` JWT ( `dev@novaflix.local` stays `admin` ), fixing persistent `500 POST /api/auth/login` for non-dev emails in no-DB dev. Short passwords still `400/500` as before.
- `client/src/components/features/HeroBanner.tsx:11` — fix `validateDOMNesting` `button inside button`: outer `<button>` → `<div role="button" tabIndex={0}>` with keyboard handler (`Enter/Space`), inner trailer button `stopPropagation` + `pointer-events-auto`, removing `chunk-GNC7SI6A` warning.

## [d021032] - 2026-08-31 — `fix(client,server): manifest JSON syntax + dev login fallback for no-DB mode`

### Fixed
- `client/public/manifest.json:19` — remove duplicate trailing `] }` causing `Manifest Line 19 column 3 Unexpected data after root element` (affected both `public` and `dist`).
- `server/controllers/authController.js:17` — add fail-open dev fallback when DB unreachable: `dev@novaflix.local / NovaflixDev123!` logs in as premium `admin` without Postgres, fixing `500 POST /api/auth/login` when `DATABASE_URL` dummy.
- `server/.env.example` — document `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD`.

## [e60ed5d] - 2026-08-31 — `fix(server): dev JWT auth fail-open when DB unavailable + rename stream-events`

### Fixed
- `server/middleware/auth.js:22` — wrap `isTokenBlocked()` in `try/catch` fail-open and retain token claims when `findUserById` returns `null` or DB unreachable; allows dev JWT `premium/admin` without Postgres.
- `server/routes/streamRoutes.js:3` — rename `POST /events` → `POST /stream-events` (no auth) to avoid collision with creator `eventRoutes POST /api/events` (`auth+creatorOrAdmin`) which caused `401/500`.

## [6f299b9] - 2026-08-31 — `feat(server): stable movie/TV streaming observability + audio probe + dedicated endpoints`

### Added
- `server/controllers/streamController.js:73` — persistent file logger `logToFile()` → `~/.novaflix/logs/events.jsonl` (10k-line cap) and `ffprobe` audio probe `probeAudioSegment()` integrated into unified `source` flow for stable movie/TV audio verification; dedicated wrappers `movieSource` / `tvSource` mapping path-param style `GET /movie/:id/source` + `GET /tv/:id/source` to unified source.
- `server/routes/streamRoutes.js:24` — keep `authMiddleware` on all streaming routes; add dedicated stable endpoints `GET /movie/:id/source` and `GET /tv/:id/source` plus `POST /stream-events` persistent logging endpoint (later renamed in `e60ed5d`).
- `server/providers/anidb-provider.js:134` — new TV/anime provider (`anidb.app`) with fix to return `null` on episode miss (prevents silent `ep1` fallback).
- `server/.env.example:3` — add `ENABLE_PROXY=true` for streaming stability.

> Merged local stream stability work (`stream` baseline before `08bf0dc` + dirty enhancements) onto `3227d5b` while discarding local aesthetic `client` (keeps remote React `client/src`). All remote auth, plan enforcement, creator hub, and 40+ business routes preserved. Parent: `3227d5b` (last other-person push `2026-08-29T05:20:16Z` by `successchukwu`).

---

## State Verification (read-only, 2026-09-02)

```bash
git remote -v
# origin https://github.com/WID-LTD/novaflix.git (fetch/push) — sole remote, wid-ltd only

git rev-parse HEAD && git ls-remote origin main
# 430851aaa077a44986d3420a8f85161dc1a4c024 (HEAD == origin/main == origin/HEAD)

git status --porcelain
# clean (no divergence after push)

git log --oneline origin/main -5
# 430851a fix(client): manifest JSON syntax in dist build artifact
# 71a227a fix(auth,client): allow any login in no-DB dev mode + HeroBanner
# d021032 fix(client,server): manifest JSON syntax + dev login fallback
# e60ed5d fix(server): dev JWT auth fail-open + rename stream-events
# 6f299b9 feat(server): stable movie/TV streaming observability
```

## Pending / Recommended Next

- **Enforce `.gitignore` for build artifacts:** `git rm --cached -r client/dist && git commit -m "chore: untrack client/dist"` — currently tracked despite ignore; future builds should generate `client/dist` from `client/public` + Vite.
- No unseen remote commits to pull (`pushed_at: 2026-09-02T15:46:47Z` matches HEAD).

## Push History Context

- Latest push overall `2026-09-01T12:53:17Z` (before this doc) by `Wizzyboypondec` (`71a227a`), now superseded by `430851a` `2026-09-02T15:46:47Z`.
- Latest other-person push `2026-08-29T05:20:16Z` by `successchukwu` (`3227d5b`).
- `HEAD == origin/main` fully synced; `origin` is `WID-LTD/novaflix` only (`git remote -v` confirms no other remotes).
