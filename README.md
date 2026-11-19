# SDG-3 AIML Studio  (website)

A self-contained web app: every unit of the AIML syllabus (2304322T) on World Bank "Good Health & Well-being" data.

## Run
```bash
./run.sh            # first run creates .venv and installs requirements, then opens http://localhost:5050
# or manually:
pip install -r requirements.txt && python server.py
```

## What is in this folder
| Path | Purpose |
|---|---|
| `server.py` | Flask app: serves the site + JSON API (overview, live refresh, search, expert system, chatbot) |
| `ml_routes.py` | ML endpoints: regression, classification, trees/SVM/ensembles/tuning, clustering/PCA/anomalies/Apriori |
| `datalib.py` | data loading, cleaning, feature engineering, live World Bank download, country-grouped split |
| `search_algos.py` / `expert.py` / `chatbot.py` | AI search + CSP + minimax, rule-based expert system, chatbot logic |
| `live_routes.py` | real-time API calls (World Bank, WHO, disease.sh, Open-Meteo) with timeouts, retries and caching |
| `paypal_routes.py` / `impact.py` | PayPal sandbox orders + the donation impact model |
| `.env.example` | template for your PayPal sandbox keys (copy to `.env`) |
| `static/` | the website: `index.html`, `style.css`, `lib.js`, `pages1-3.js`, `app.js`, bundled Plotly (works offline) |
| `data/sdg3_health_raw.csv` | static data snapshot (1970-2024, 217 countries, 15 indicators) |

## Pages
Home (live World Bank refresh, retrain & benchmark, world explorer) · Regression Lab · Classification Lab · Trees & Ensembles ·
Discovery Lab · AI Search Playground · Expert System & Chatbot · **Live Pulse** · **Fund Impact**.

## Real-time data
* **Auto-sync:** when the server starts and `data/live_raw.csv` is missing or older than `AUTO_SYNC_HOURS` (default 24), it downloads all 15 World Bank
  indicators for every country in the background (1-4 min - the World Bank API is slow). The sidebar shows progress; when done the new data is swapped in
  atomically, with no restart, and every model uses it from then on. Set `AUTO_SYNC_HOURS=0` to turn this off. A failed sync never touches the stored data.
* **Live Pulse page:** five public, key-less APIs are queried live and in parallel - World Bank (country record + 6 indicators, shown next to the stored
  snapshot), WHO GHO (an independent life-expectancy figure), disease.sh (COVID-19, flag, population) and Open-Meteo (air quality + weather at the capital).
  Each source reports whether it answered and how fast. Auto-refreshes every 60 s.

## PayPal sandbox (Fund Impact page)
Real PayPal Smart Buttons against the **sandbox** (hard-coded - no real money can move). Without keys the page runs in a clearly-labelled *simulation
mode*. To use real sandbox checkout: copy `.env.example` to `.env`, paste the Client ID and Secret from developer.paypal.com -> Apps & Credentials -> Sandbox,
restart. Log in at checkout with a sandbox *personal* test account. The secret stays on the server; amount and country are validated and stored server-side
when the order is created. Donations are kept in `data/donations.json` (Ledger tab). The "person-years of life" figure is an illustrative model estimate,
not a causal promise.

## For research use
* **Methods page** (`/#methods`) documents sources, coverage per indicator, data preparation, the country-grouped split, 5-fold grouped cross-validation
  against trivial baselines, hyper-parameters, limitations and ethics, and the exact software versions. Every number on it is computed from the loaded
  data (`/api/methods`), including a SHA-256 fingerprint of the data file so a quoted result can be tied to the data that produced it.
* **Cite page** (`/#cite`) gives APA and BibTeX citations, and every page ends with "How to cite this page". Edit `paper.json` (authors, affiliation,
  year, version, repository, DOI) and the citations update everywhere.
* **Figures** are numbered, show their source, and can be downloaded as high-resolution PNG, SVG or the plotted data as CSV.
* **Licences** of every data source are listed on the Methods page as stated by the providers (World Bank CC BY 4.0; WHO data terms; Open-Meteo CC BY 4.0,
  free tier non-commercial; disease.sh terms). Check them again before publishing.

## Imagery and motion
* **Photographs** on the Overview, Live Pulse and Fund Impact pages are openly licensed images from Wikimedia Commons, stored in `static/img/`
  with full attributions in `static/img/CREDITS.md` (also shown on the Overview page under "Image credits" and beside each image).
  The numbers printed next to the photos come from `/api/focus`, which uses real observed values only.
* **Animation** is built in and works offline: a rotating globe coloured by life expectancy, a time-lapse that plays the world map and the
  wealth-and-longevity chart from 1970 to 2024, count-up figures, a heartbeat line on Live Pulse, and a gentle scroll-reveal on the Overview.
  Everything respects the operating-system "reduce motion" setting.
* **Typography** uses standard system fonts (Georgia for headings, Arial for text) at a generous size.

## Notes
* **Manual refresh** (Home -> Live API refresh) does the same download on demand; "Back to static" removes the live copy.
* **Chatbot** works offline with the built-in parser; paste an Anthropic API key (or set `ANTHROPIC_API_KEY`) to use Claude.
  It answers from observed values only - never from imputed ones.
* Train/test splits are grouped by country (no country in both sets) to avoid leakage.
