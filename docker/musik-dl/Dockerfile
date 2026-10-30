# FWV Musik: Songs ergaenzen mit spotDL (dienst.py). Nur intern erreichbar,
# api-members ruft ihn auf.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp braucht fuer YouTube eine JavaScript-Laufzeit, von Haus aus deno.
COPY --from=denoland/deno:bin-2.9.7 /deno /usr/local/bin/deno

# spotDL fest; yt-dlp danach auf die neueste Fassung, weil YouTube oft etwas
# aendert und nur ein aktuelles yt-dlp mithaelt.
RUN pip install --no-cache-dir spotdl==4.6.0 \
    && pip install --no-cache-dir --upgrade yt-dlp

RUN useradd --create-home --uid 1000 musik \
    && mkdir -p /daten && chown musik /daten
COPY dienst.py /app/dienst.py
USER musik
WORKDIR /app
VOLUME /daten
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/gesund',timeout=4)"
CMD ["python", "-u", "/app/dienst.py"]
