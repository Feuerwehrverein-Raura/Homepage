---
name: fwv-kiste-erfassen
description: Eine Lagerkiste des Vereins (S1, S2, ... im Roten Schopf) im Inventar (inventar.fwv-raura.ch) erfassen - Kiste als Lagerort mit Deckel-Text und Foto, Artikel mit Menge und FWV-Code. Verwenden, wenn der Nutzer Fotos einer Kiste schickt ("die naechste Kiste", "Kiste S21", Deckel mit Nummer und Etikett) oder Kisteninhalt nachtragen will.
---

# Kiste im Lager erfassen

Der Nutzer schickt meist zwei Fotos: **Inhalt** (offene Kiste) und
**Deckel** (rotes Schild «S<Nr>» = Kistenname, gelbes Etikett = Inhalt,
Zettel = Anzahl). Vorlage ist Kiste S8 (19.10.2026): Lagerort «S8»,
Beschreibung «32 Kaffeegläser», Foto, ein Artikel «Kaffeeglas» 32 Stk.

Produktiv-Datenbank: Jede Kiste braucht die **ausdrueckliche Freigabe des
Nutzers** fuer genau diese Aenderung (wie bei S8, «Freigabe Stefan»).
Vorher zeigen, was angelegt wird.

## 1. Lesen und Vorschlag machen

Heinzel-Onboarding fuer docker.fwv-raura.ch (CLAUDE.md), dann nur lesend:

```sh
ssh -o BatchMode=yes -o ConnectTimeout=5 stefan@docker.fwv-raura.ch \
  'sudo docker exec -i inventory-postgres sh -c "psql -X -U \$POSTGRES_USER -d \$POSTGRES_DB"' <<'SQL'
select id, name, description, image_url from locations order by id;
select id, name, quantity, custom_barcode, location_id from items
 where active and name ilike '%<Suchwort>%';
select last_number from barcode_counter;
select max(substring(custom_barcode from 4)::int) from items where custom_barcode ~ '^FWV[0-9]+$';
SQL
```

- Gibt es die Kiste schon? Den Artikel schon (dann zuordnen statt neu)?
- `barcode_counter.last_number` muss >= dem hoechsten vergebenen Code sein
  - sonst zuerst nachziehen (bei S8 lag er zurueck → Duplikat FWV000066).
- Vorschlag an den Nutzer: Kistenname, Beschreibung (= Deckel-Etikett mit
  Anzahl, z.B. «19 Aschenbecher»), Artikel mit Mengen. Bei gemischtem
  Inhalt (verschiedene Sorten) fragen: ein Artikel oder mehrere?

## 2. Foto

Inhaltsfoto als JPEG, laengste Seite 1600 px (S8: ~390 KB), Ausrichtung
pruefen (S8 musste nachtraeglich gedreht werden):

```sh
sips -s format jpeg -s formatOptions 80 -Z 1600 <foto> --out kiste-<uuid>.jpg
scp kiste-<uuid>.jpg stefan@docker.fwv-raura.ch:/tmp/
ssh … 'sudo install -m 644 /tmp/kiste-<uuid>.jpg /opt/docker/simple-inventory-system/data/uploads/ && rm /tmp/kiste-<uuid>.jpg'
```

Im Container `inventory-backend` ist das `/app/uploads`, im Web
`/api/uploads/kiste-<uuid>.jpg`. Ein ersetztes altes Foto loeschen.

## 3. Anlegen (eine Transaktion)

```sql
begin;
insert into locations (name, description, image_url)
  values ('S21', '19 Aschenbecher', '/api/uploads/kiste-<uuid>.jpg')
  returning id;                                   -- = :ort
update barcode_counter set last_number = last_number + 1 where id = 1
  returning last_number;                          -- = :n
insert into items (name, custom_barcode, quantity, unit, location_id, notes)
  values ('Aschenbecher', 'FWV' || lpad(:n::text, 6, '0'), 19, 'Stück', :ort, '<Sorten>')
  returning id;                                   -- = :artikel
insert into item_locations (item_id, location_id, quantity) values (:artikel, :ort, 19);
commit;
```

Werte als SQL-Literale (einfache Anfuehrungszeichen verdoppeln). Bestehender
Artikel: nur `item_locations` (und ggf. `items.location_id`).

## 4. Pruefen und protokollieren

- `https://inventar.fwv-raura.ch/kiste/<id>` zeigt Kiste, Foto, Inhalt
  (QR-Code auf dem Deckelblatt fuehrt dorthin).
- Deckelblatt/Etikett drucken: im Lager Reiter «Kisten» bzw. Berichte →
  Kisten-Etiketten.
- Journal: `logger -t heinzel 'inventory-db: Kiste S21 (...) erfasst'`
- `memory/servers/docker.fwv-raura.ch/changelog.log` im vorhandenen
  Format, mit «Freigabe <Name>».
