// ---------------------------------------------------------------------------
// Verkaufsstatistik (Oktober 2026, nach der Chilbi)
//
// Eine Auswertung fuer zwei Faelle: der laufende Geschaeftstag (Tagesstatistik
// wie bisher) oder ein ganzer Anlass (event_id an der Bestellung, gleiche
// Auswahl wie in der Bestellhistorie). Ohne stornierte Bestellungen.
//
// - Tage: Geschaeftstag 12-12 Uhr Schweizer Zeit wie src/zeit.ts.
// - Zahlungsarten: Teil-/Tischzahlungen (order_payments), sonst die Zahlungsart
//   der Bestellung - nie beides, sonst zaehlt eine Bestellung doppelt.
// - Kategorien: die der Kasse (Kacheln), ueber die Artikelliste.
// ---------------------------------------------------------------------------

import pg from 'pg';
import { anzeigeNameSql } from './anzeigename.js';

export type StatistikFilter = { anlass: string } | { von: Date; bis: Date };

export interface ArtikelZeile {
  item_id: string | null;
  name: string;
  total_sold: number;
  total_revenue: number;
}

export interface KategorieZeile {
  name: string;
  menge: number;
  umsatz: number;
}

export const OHNE_ARTIKEL = 'Ohne Artikel';
export const UEBRIGE = 'Übrige';

/** Umsatz und Menge je Kasse-Kategorie, nach Umsatz absteigend. */
export function kategorienZusammenfassen(
  artikel: ArtikelZeile[],
  kategorieVon: (itemId: string) => string | undefined,
): KategorieZeile[] {
  const summen = new Map<string, KategorieZeile>();
  for (const a of artikel) {
    const name = a.item_id ? (kategorieVon(String(a.item_id)) || UEBRIGE) : OHNE_ARTIKEL;
    const z = summen.get(name) ?? { name, menge: 0, umsatz: 0 };
    z.menge += Number(a.total_sold);
    z.umsatz = Math.round((z.umsatz + Number(a.total_revenue)) * 100) / 100;
    summen.set(name, z);
  }
  return [...summen.values()].sort((a, b) => b.umsatz - a.umsatz || a.name.localeCompare(b.name));
}

function bedingung(filter: StatistikFilter): { sql: string; werte: unknown[] } {
  if ('anlass' in filter) return { sql: 'o.event_id = $1', werte: [filter.anlass] };
  return { sql: 'o.created_at >= $1 AND o.created_at < $2', werte: [filter.von.toISOString(), filter.bis.toISOString()] };
}

const TAG_SQL = `((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Zurich') - INTERVAL '12 hours')::date`;

export async function verkaufsstatistik(
  pool: pg.Pool,
  filter: StatistikFilter,
  kategorieVon: (itemId: string) => string | undefined,
) {
  const { sql, werte } = bedingung(filter);
  const gueltig = `${sql} AND o.status <> 'cancelled'`;

  const [summary, tage, zahlungen, artikel] = await Promise.all([
    pool.query(`
      SELECT COUNT(*) FILTER (WHERE o.status <> 'cancelled')::int AS total_orders,
             COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS total_revenue,
             COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders,
             COUNT(*) FILTER (WHERE o.status = 'paid')::int AS paid_orders,
             COUNT(*) FILTER (WHERE o.status = 'pending')::int AS pending_orders,
             COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_orders,
             MAX(o.event_titel) AS titel
        FROM orders o WHERE ${sql}`, werte),
    pool.query(`
      SELECT to_char(${TAG_SQL}, 'YYYY-MM-DD') AS tag, COUNT(*)::int AS bestellungen, SUM(o.total) AS umsatz
        FROM orders o WHERE ${gueltig}
       GROUP BY 1 ORDER BY 1`, werte),
    pool.query(`
      WITH z AS (
        SELECT p.payment_method AS art, p.amount AS betrag
          FROM order_payments p JOIN orders o ON o.id = p.order_id WHERE ${gueltig}
        UNION ALL
        SELECT COALESCE(o.payment_method, 'offen'), o.total
          FROM orders o WHERE ${gueltig}
           AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id))
      SELECT art, COUNT(*)::int AS anzahl, SUM(betrag) AS betrag FROM z
       WHERE betrag <> 0 GROUP BY art ORDER BY SUM(betrag) DESC`, werte),
    pool.query(`
      SELECT MAX(i.item_id) AS item_id,
             COALESCE(${anzeigeNameSql('i.item_name')}, 'Sonderposten') AS name,
             SUM(i.quantity)::int AS total_sold,
             SUM(i.quantity * i.price) AS total_revenue
        FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${gueltig}
       GROUP BY ${anzeigeNameSql('i.item_name')}
       ORDER BY SUM(i.quantity) DESC, SUM(i.quantity * i.price) DESC`, werte),
  ]);

  const { titel, ...zusammenfassung } = summary.rows[0];
  return {
    titel: titel ?? null,
    summary: zusammenfassung,
    tage: tage.rows,
    zahlungsarten: zahlungen.rows,
    kategorien: kategorienZusammenfassen(artikel.rows, kategorieVon),
    artikel: artikel.rows,
    top_items: artikel.rows.slice(0, 10),
  };
}
