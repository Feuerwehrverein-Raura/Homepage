import type { Arbeitsplan, ArbeitsplanZelle } from "@/lib/types/event";

// Arbeitsplan als Tabelle. Aufbau und Inhalt kommen fertig vom Backend
// (GET /events/:id/arbeitsplan) — hier wird nichts gruppiert oder gezaehlt,
// nur gezeichnet: Zeilen sind die Zeitfenster, Spalten die Bereiche,
// eingetragen die bestaetigten Helfer, offene Plaetze als Strich, Felder
// ohne Schicht (null) schwarz.
//
// Bewusst ohne API-Import, damit die Tests die Tabelle direkt mit der
// Vertrags-Datei (docker/backend-events/test/fixtures/arbeitsplan.json)
// zeichnen koennen.

export interface FeldZeile {
  text: string;
  /** true = offener Platz (grauer Strich) */
  offen: boolean;
}

/**
 * Inhalt eines Tabellenfelds. `null` heisst: keine Schicht, schwarzes Feld.
 * Sonst: je bestaetigter Helfer "-Name", danach je offener Platz ein "-".
 * Ueberbuchte Schichten (offen: 0) haben keine Striche.
 */
export function feldZeilen(zelle: ArbeitsplanZelle | null | undefined): FeldZeile[] | null {
  if (!zelle) return null;
  return [
    ...zelle.besetzt.map((n) => ({ text: `-${n}`, offen: false })),
    ...Array.from({ length: Math.max(0, zelle.offen) }, () => ({
      text: "-",
      offen: true,
    })),
  ];
}

export function ArbeitsplanTable({ plan }: { plan: Arbeitsplan }) {
  if (plan.tage.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Keine Schichten für diesen Anlass vorhanden.
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <div className="text-lg font-semibold">{plan.verein}</div>
        <div className="text-2xl font-bold underline mt-2">{plan.titel}</div>
      </div>
      {plan.tage.map((tag, ti) => (
        <div key={tag.datum ?? `tag-${ti}`}>
          <h3 className="mt-6 mb-4 text-lg font-bold underline">
            {tag.bezeichnung}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left font-bold border border-gray-400 bg-muted w-32">
                    Zeit
                  </th>
                  {plan.bereiche.map((b) => (
                    <th
                      key={b}
                      className="px-3 py-2 text-left font-bold border border-gray-400 bg-muted"
                    >
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tag.zeilen.map((zeile, zi) => (
                  <tr key={`${zeile.zeit}-${zi}`}>
                    <td className="px-3 py-2 border border-gray-400 font-medium align-top whitespace-nowrap">
                      {zeile.zeit}
                    </td>
                    {plan.bereiche.map((b, bi) => {
                      const zeilen = feldZeilen(zeile.zellen[bi]);
                      if (!zeilen) {
                        return (
                          <td
                            key={b}
                            data-leer="true"
                            className="px-3 py-2 border border-gray-400 bg-gray-900"
                          />
                        );
                      }
                      return (
                        <td
                          key={b}
                          className="px-3 py-2 border border-gray-400 align-top"
                        >
                          {zeilen.map((z, i) => (
                            <div
                              key={i}
                              className={z.offen ? "text-gray-400" : undefined}
                            >
                              {z.text}
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
