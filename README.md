# OSINT Flight & Ship Tracker

Free live dashboard built only from public data. No API keys.

- Aircraft: ADS-B community feeds (adsb.lol, with airplanes.live fallback), 250 nm max radius around the map centre.
- Ships: Fintraffic Digitraffic AIS (CC BY 4.0), Baltic Sea / Northern Europe only.
- Hosting: Netlify free tier (static page + two serverless functions at /api/flights and /api/ships).

Public data is self-reported, can be delayed or incomplete. Use it responsibly.
