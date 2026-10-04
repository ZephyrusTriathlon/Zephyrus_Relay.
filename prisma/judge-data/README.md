# Supplied judge references

These five CSVs are exact copies of the supplied Tech-Triathlon operational references in data/General Data/. They are bundled so a fresh clone and Docker startup seed the shared 120-outlet, 60-vehicle network. They replace the earlier independently generated simplified network.

manifest.json records SHA-256 hashes. Running node scripts/generate-judge-data.mjs packages the supplied local files without synthesizing or changing records. The HTTP server does not expose these files.

The original calendar runs from 2024-01-01 through 2026-06-28. Judge mode uses a disclosed historical business clock for new ordering; calendar dates and flags are preserved. The main seeded route remains 2025-01-02. Use a fresh database when upgrading from the simplified network: seed refuses differing existing references and never resets operational history.
