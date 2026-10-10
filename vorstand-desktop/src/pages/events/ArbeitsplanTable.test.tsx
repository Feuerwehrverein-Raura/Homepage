// @vitest-environment jsdom
//
// Vertragstest: Die Desktop-App muss die Vertrags-Datei des Backends
// (docker/backend-events/test/fixtures/arbeitsplan.json) verstehen und
// richtig zeichnen. Aendert sich das Format, wird hier (und bei `tsc`) rot.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import fixture from "../../../../docker/backend-events/test/fixtures/arbeitsplan.json";
import type { Arbeitsplan } from "@/lib/types/event";
import { ArbeitsplanTable, feldZeilen } from "./ArbeitsplanTable";

vi.mock("@/lib/api/events", () => ({
  getArbeitsplan: vi.fn(async () => fixture),
}));

// Compile-Zeit: passt die Datei nicht mehr zum Typ, bricht `tsc --noEmit`.
const plan: Arbeitsplan = fixture;

afterEach(cleanup);

function keys(o: object) {
  return Object.keys(o).sort();
}

describe("Vertrags-Datei arbeitsplan.json", () => {
  it("hat genau die Felder des Typs Arbeitsplan", () => {
    expect(keys(plan)).toEqual(["anlass", "bereiche", "tage", "titel", "verein"]);
    expect(typeof plan.verein).toBe("string");
    expect(typeof plan.titel).toBe("string");
    expect(typeof plan.anlass).toBe("string");
    expect(plan.bereiche.every((b) => typeof b === "string")).toBe(true);
    expect(plan.tage.length).toBeGreaterThan(0);

    for (const tag of plan.tage) {
      expect(keys(tag)).toEqual(["bezeichnung", "datum", "zeilen"]);
      expect(tag.datum === null || typeof tag.datum === "string").toBe(true);
      expect(typeof tag.bezeichnung).toBe("string");
      for (const zeile of tag.zeilen) {
        expect(keys(zeile)).toEqual(["zeit", "zellen"]);
        expect(typeof zeile.zeit).toBe("string");
        // Zellen laufen parallel zu den Bereichen.
        expect(zeile.zellen).toHaveLength(plan.bereiche.length);
        for (const zelle of zeile.zellen) {
          if (zelle === null) continue;
          expect(keys(zelle)).toEqual(["besetzt", "gebraucht", "offen"]);
          expect(zelle.besetzt.every((n) => typeof n === "string")).toBe(true);
          expect(Number.isInteger(zelle.gebraucht)).toBe(true);
          expect(Number.isInteger(zelle.offen)).toBe(true);
          expect(zelle.offen).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("enthaelt die im README versprochenen Sonderfaelle", () => {
    const zellen = plan.tage.flatMap((t) => t.zeilen.flatMap((z) => z.zellen));
    expect(zellen).toContain(null);
    expect(zellen.some((z) => z && z.besetzt.length === 0 && z.offen > 0)).toBe(true);
    expect(zellen.some((z) => z && z.offen === 0 && z.besetzt.length > z.gebraucht)).toBe(
      true
    );
    expect(plan.bereiche).toContain("Allgemein");
  });
});

describe("feldZeilen", () => {
  it("null/fehlend = keine Schicht (schwarzes Feld)", () => {
    expect(feldZeilen(null)).toBeNull();
    expect(feldZeilen(undefined)).toBeNull();
  });

  it("Helfer als -Name, offene Plaetze als graue Striche", () => {
    expect(feldZeilen({ besetzt: ["Anna A"], gebraucht: 2, offen: 1 })).toEqual([
      { text: "-Anna A", offen: false },
      { text: "-", offen: true },
    ]);
  });

  it("leere Schicht: nur Striche", () => {
    expect(feldZeilen({ besetzt: [], gebraucht: 1, offen: 1 })).toEqual([
      { text: "-", offen: true },
    ]);
  });

  it("ueberbucht (offen 0): nur Namen, kein Strich", () => {
    expect(feldZeilen({ besetzt: ["Bea B", "Cem C"], gebraucht: 1, offen: 0 })).toEqual([
      { text: "-Bea B", offen: false },
      { text: "-Cem C", offen: false },
    ]);
  });
});

describe("ArbeitsplanTable mit der Vertrags-Datei", () => {
  it("zeichnet Kopf, Tage, Bereiche und Felder", () => {
    const { container } = render(<ArbeitsplanTable plan={plan} />);

    screen.getByText(plan.verein);
    screen.getByText(plan.titel);

    const tabellen = container.querySelectorAll("table");
    expect(tabellen).toHaveLength(plan.tage.length);

    plan.tage.forEach((tag, ti) => {
      screen.getByText(tag.bezeichnung);
      const tabelle = tabellen[ti];
      const kopf = [...tabelle.querySelectorAll("thead th")].map((th) => th.textContent);
      expect(kopf).toEqual(["Zeit", ...plan.bereiche]);

      const zeilen = tabelle.querySelectorAll("tbody tr");
      expect(zeilen).toHaveLength(tag.zeilen.length);

      tag.zeilen.forEach((zeile, zi) => {
        const tds = zeilen[zi].querySelectorAll("td");
        expect(tds).toHaveLength(1 + plan.bereiche.length);
        expect(tds[0].textContent).toBe(zeile.zeit);

        zeile.zellen.forEach((zelle, bi) => {
          const td = tds[bi + 1];
          if (zelle === null) {
            expect(td.className).toContain("bg-gray-900");
            expect(td.textContent).toBe("");
            return;
          }
          const divs = [...td.querySelectorAll("div")];
          const namen = divs.filter((d) => !d.className.includes("text-gray-400"));
          const striche = divs.filter((d) => d.className.includes("text-gray-400"));
          expect(namen.map((d) => d.textContent)).toEqual(
            zelle.besetzt.map((n) => `-${n}`)
          );
          expect(striche).toHaveLength(zelle.offen);
          striche.forEach((d) => expect(d.textContent).toBe("-"));
        });
      });
    });
  });

  it("ohne Tage: Hinweis statt Tabelle", () => {
    const { container } = render(<ArbeitsplanTable plan={{ ...plan, tage: [] }} />);
    expect(container.querySelector("table")).toBeNull();
    screen.getByText(/Keine Schichten/);
  });
});

describe("ArbeitsplanView", () => {
  it("laedt den Plan und zeichnet ihn", async () => {
    const { ArbeitsplanView } = await import("./ArbeitsplanView");
    const { container } = render(<ArbeitsplanView eventId="e1" />);
    await screen.findByText(plan.titel);
    expect(container.querySelectorAll("table")).toHaveLength(plan.tage.length);
    const name = plan.tage
      .flatMap((t) => t.zeilen.flatMap((z) => z.zellen))
      .find((z) => z && z.besetzt.length > 0)!.besetzt[0];
    within(container).getByText(`-${name}`);
  });
});
