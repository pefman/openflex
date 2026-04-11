# OpenFlex

A self-hosted media manager for movies and TV shows. Search, download, organise, and stream your library — all from one interface.

> **Docker Hub:** [hub.docker.com/r/pefman/openflex](https://hub.docker.com/r/pefman/openflex)

---

## Getting Started

### 1. Get a TMDB API Key

OpenFlex uses [The Movie Database (TMDB)](https://www.themoviedb.org/) for metadata. It's free:

1. Create an account at [themoviedb.org](https://www.themoviedb.org/signup)
2. Go to **Settings → API** and request an API key (choose "Developer")
3. Copy your **API Key (v3 auth)**

---

### 2. Run with Docker

```bash
docker run -d \
  --name openflex \
  --restart unless-stopped \
  -p 7878:7878 \
  -v /your/media/path:/data \
  pefman/openflex:latest
```

Replace `/your/media/path` with a folder on your host where OpenFlex will store its database, downloads, and media library.

Open [http://localhost:7878](http://localhost:7878) in your browser.

---

### 3. First-Time Setup

1. **Register** — On first launch you'll be prompted to create an account.
2. **TMDB key** — Go to **Settings → General** and enter your TMDB API key if you didn't set it via the environment variable.
3. **Add an indexer** — Go to **Settings → Indexers** and add a Newznab (e.g. NZBGeek) or Torznab indexer. You'll need the URL and API key from your indexer provider.
4. **Add a usenet server** *(if using Usenet)* — Go to **Settings → Usenet** and enter your provider's hostname, port, credentials, and connection count.
5. **Set a quality profile** — Go to **Settings → Quality** to configure minimum quality thresholds and any keyword filters.

---

### 4. Add Content & Download

- Go to **Movies** or **Shows** and click **Add** to search TMDB.
- Toggle **Monitored** on a movie or episode to mark it as wanted.
- The **scheduler** will automatically search your indexers at the configured interval and grab matching releases.
- You can also trigger a **Manual Search** at any time from the detail page.
- Track progress in the **Downloads** tab — it shows live speed, progress, and ETA.

---

### 5. Stream

- Click any movie or episode with a downloaded file to open the player.
- Use the quality selector to switch between **Original**, **1080p**, **720p**, or **480p** (HLS transcode).
- Subtitles (if embedded in the file) are available via the subtitle selector.
- Cast to a TV using the **Chromecast** button if you're on the same network.

---

## Configuration Reference

All settings can be provided as environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7878` | Port the web UI and API listen on |
| `DATA_DIR` | `./data` | Root folder for database, downloads, and media |
| `DATABASE_URL` | `file:./data/openflex.db` | SQLite database path |
| `JWT_SECRET` | dev default | **Change this in production** |
| `TMDB_API_KEY` | — | Required for metadata and search |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |

---

## Data Layout

```
data/
  openflex.db          # SQLite database
  cache/
    images/            # Cached TMDB posters/backdrops
    hls/               # HLS transcode segments
  downloads/           # Active download working directory
  media/               # Organised library (movies + shows)
```

## API

All routes require `Authorization: Bearer <jwt>` except `/auth/register` and `/auth/login`.

| Prefix | Description |
|--------|-------------|
| `POST /auth/register` | Create account |
| `POST /auth/login` | Get JWT |
| `GET/POST /api/movies` | Movie library |
| `GET /api/movies/:id/search` | Search indexers for a movie |
| `POST /api/movies/:id/grab` | Grab a specific release |
| `GET/POST /api/shows` | Show library |
| `GET /api/shows/:id/episodes/:eid/search` | Search indexers for an episode |
| `GET/PUT /api/downloads` | Download queue |
| `GET /api/stream/:id` | Direct play (Range support) |
| `GET /api/stream/:id/hls` | Start HLS transcode |
| `POST /api/stream/:id/token` | Issue stream token (for Chromecast) |
| `GET /api/stream/:id/subtitles` | Extract subtitle tracks |
| `GET/PUT /api/settings` | App settings |
| `GET/POST /api/quality-profiles` | Quality profiles |
| `GET /api/logs` | Recent server logs |

---

## GPU Hardware Transcoding

OpenFlex can use your GPU for hardware-accelerated transcoding (NVENC on NVIDIA, VA-API on AMD/Intel). This significantly reduces CPU load and speeds up HLS segment generation during streaming.

The Docker image contains **no GPU drivers or CUDA libraries** — it relies entirely on the host to provide them at runtime. This keeps the image small and ensures you always get the correct driver version for your hardware.

---

### NVIDIA (NVENC)

**Host requirements:**
- NVIDIA GPU with NVENC support (Maxwell or newer — GTX 950+, RTX, Quadro, Tesla)
- NVIDIA driver installed on the host (`nvidia-smi` should work)
- [`nvidia-container-toolkit`](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installed

**Install nvidia-container-toolkit (Ubuntu/Debian):**
```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

**docker-compose.yml** (already included — no changes needed):
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu, video]
```

**docker run** equivalent:
```bash
docker run -d \
  --name openflex \
  --restart unless-stopped \
  --gpus all \
  -p 7878:7878 \
  -v /your/media/path:/data \
  pefman/openflex:latest
```

**Verify it's working:**
```bash
docker exec openflex ffmpeg -encoders 2>&1 | grep nvenc
# Should list: h264_nvenc, hevc_nvenc
```

---

### AMD / Intel (VA-API)

VA-API uses the host's Mesa/iHD driver stack, which is injected via a `/dev/dri` device passthrough. No additional toolkit is needed.

**Host requirements:**
- AMD: Mesa ≥ 20 with `radeonsi` or `radv` (ships with most modern Linux distros)
- Intel: `intel-media-va-driver` (Tiger Lake / Xe) or `i965-va-driver` (older Gen)

**Install drivers on the host (Ubuntu/Debian):**
```bash
# AMD
sudo apt-get install -y mesa-va-drivers

# Intel (Gen8–Gen11, Broadwell–Ice Lake)
sudo apt-get install -y i965-va-driver

# Intel (Gen12+, Tiger Lake / Xe / Arc)
sudo apt-get install -y intel-media-va-driver
```

**docker-compose.yml** — uncomment the `devices` block:
```yaml
services:
  openflex:
    # ...
    devices:
      - /dev/dri:/dev/dri
```

**docker run** equivalent:
```bash
docker run -d \
  --name openflex \
  --restart unless-stopped \
  --device /dev/dri:/dev/dri \
  -p 7878:7878 \
  -v /your/media/path:/data \
  pefman/openflex:latest
```

**Verify it's working:**
```bash
docker exec openflex ffmpeg -encoders 2>&1 | grep vaapi
# Should list: h264_vaapi, hevc_vaapi, av1_vaapi
```

> **Note:** On some hosts you may also need to add the container user to the `render` group, or set `group_add: [render, video]` in your compose file if the `/dev/dri` device is not accessible:
> ```yaml
> group_add:
>   - "render"
>   - "video"
> ```

---

### No GPU / Software Fallback

If no GPU device is passed to the container, OpenFlex automatically falls back to software transcoding using libx264/libx265. No configuration change is needed — just omit the `deploy:` / `devices:` blocks from your compose file.

---
