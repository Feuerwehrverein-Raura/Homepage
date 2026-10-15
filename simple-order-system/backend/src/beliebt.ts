// ---------------------------------------------------------------------------
// Meistverkaufte Artikel (Oktober 2026)
//
// Die Kasse zeigt innerhalb jeder Kategorie die meistverkauften Artikel
// zuerst. Massgebend sind die Bestellungen des aktuellen Anlasses, danach die
// der letzten 30 Tage (fuer den Anfang eines Anlasses, wenn noch kaum etwas
// verkauft ist). Stornierte Bestellungen und Sonderposten (ohne item_id)
// zaehlen nicht.
//
// Das Frontend holt die Reihenfolge nur beim Start und bei einem Wechsel des
// Anlasses - nie nach jeder Bestellung, sonst springen die Knoepfe unter dem
// Finger weg.
// ---------------------------------------------------------------------------

export const BELIEBT_SQL = `
  SELECT oi.item_id,
         COALESCE(SUM(oi.quantity) FILTER (WHERE $1::text IS NOT NULL AND o.event_id = $1::text), 0) AS anlass_menge,
         COALESCE(SUM(oi.quantity) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days'), 0) AS menge_30_tage
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
   WHERE oi.item_id IS NOT NULL
     AND COALESCE(o.status, '') <> 'cancelled'
     AND (o.created_at > NOW() - INTERVAL '30 days' OR ($1::text IS NOT NULL AND o.event_id = $1::text))
   GROUP BY oi.item_id
   ORDER BY anlass_menge DESC, menge_30_tage DESC, oi.item_id
   LIMIT 500`;

export interface BeliebtEintrag {
  item_id: string;
  anlass: number;
  tage30: number;
}

// Zeilen aus BELIEBT_SQL -> Antwort, beliebteste zuerst (sortiert auch
// selbst, falls die Zeilen anders ankommen).
export function beliebtListe(zeilen: any[]): BeliebtEintrag[] {
  return (Array.isArray(zeilen) ? zeilen : [])
    .filter((z) => z && z.item_id !== null && z.item_id !== undefined && String(z.item_id) !== '')
    .map((z) => ({
      item_id: String(z.item_id),
      anlass: Number(z.anlass_menge) || 0,
      tage30: Number(z.menge_30_tage) || 0,
    }))
    .sort((a, b) => (b.anlass - a.anlass) || (b.tage30 - a.tage30) || a.item_id.localeCompare(b.item_id));
}
