import { useEffect, useMemo, useState } from "react";
import {
  getEventRecipes,
  getShoppingList,
  getAvailableRecipes,
  getAvailableItems,
  linkEventRecipe,
  updateEventRecipe,
  unlinkEventRecipe,
  addManualItem,
  removeManualItem,
} from "@/lib/api/event-materials";
import { cn } from "@/lib/utils";
import type {
  EventRecipe,
  AvailableRecipe,
  AvailableItem,
  ShoppingList,
  ShoppingListItem,
} from "@/lib/types/event-materials";
import {
  Loader2,
  Plus,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle,
  ChefHat,
  Package,
  ShoppingCart,
} from "lucide-react";

// Zahlen kommen als String ODER Number → robust nach Number wandeln.
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Rezept-ID robust aufloesen: manche Antworten liefern recipe_id, andere id.
const recipeIdOf = (r: EventRecipe): number => r.recipe_id ?? r.id;

// Mengenangabe mit optionaler Einheit formatieren.
const qty = (value: unknown, unit?: string | null): string => {
  const n = num(value);
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return unit ? `${rounded} ${unit}` : rounded;
};

type Notice = { type: "error" | "success"; text: string };

export function EventMaterials({ eventId }: { eventId: string }) {
  const [recipes, setRecipes] = useState<EventRecipe[]>([]);
  const [shopping, setShopping] = useState<ShoppingList | null>(null);
  const [availRecipes, setAvailRecipes] = useState<AvailableRecipe[]>([]);
  const [availItems, setAvailItems] = useState<AvailableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Portionen-Entwuerfe je Rezept (recipe_id -> Eingabewert).
  const [servingsDraft, setServingsDraft] = useState<Record<number, string>>({});

  // Formulare zum Hinzufuegen.
  const [newRecipeId, setNewRecipeId] = useState("");
  const [newRecipeServings, setNewRecipeServings] = useState("1");
  const [newItemId, setNewItemId] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");

  // Laufende Aktionen (Spinner / Deaktivierung).
  const [busyRecipeId, setBusyRecipeId] = useState<number | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [rec, list, aRec, aItems] = await Promise.all([
          getEventRecipes(eventId),
          getShoppingList(eventId),
          getAvailableRecipes(eventId),
          getAvailableItems(eventId),
        ]);
        if (cancelled) return;
        setRecipes(rec);
        setShopping(list);
        setAvailRecipes(aRec);
        setAvailItems(aItems);
        setServingsDraft(
          Object.fromEntries(
            rec.map((r) => [recipeIdOf(r), String(num(r.servings))])
          )
        );
      } catch (e) {
        if (!cancelled) {
          setNotice({
            type: "error",
            text:
              e instanceof Error
                ? e.message
                : "Rezepte & Material konnten nicht geladen werden",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  // Bereits verknuepfte Rezept-IDs → aus der Auswahl ausblenden.
  const linkedRecipeIds = useMemo(
    () => new Set(recipes.map(recipeIdOf)),
    [recipes]
  );
  const selectableRecipes = useMemo(
    () => availRecipes.filter((r) => !linkedRecipeIds.has(r.id)),
    [availRecipes, linkedRecipeIds]
  );

  // Manuell erfasste Positionen (manual_needed > 0) aus der Einkaufsliste.
  const manualItems = useMemo<ShoppingListItem[]>(
    () => (shopping?.items ?? []).filter((i) => num(i.manual_needed) > 0),
    [shopping]
  );
  const manualItemIds = useMemo(
    () => new Set(manualItems.map((i) => i.item_id)),
    [manualItems]
  );
  const selectableItems = useMemo(
    () => availItems.filter((i) => !manualItemIds.has(i.id)),
    [availItems, manualItemIds]
  );

  const items = shopping?.items ?? [];
  const missingCount = items.filter((i) => num(i.to_buy) > 0).length;

  const handleSaveServings = async (recipeId: number) => {
    const raw = servingsDraft[recipeId];
    const value = Math.floor(num(raw));
    if (!(value >= 1)) {
      setNotice({ type: "error", text: "Portionen muss mindestens 1 sein." });
      return;
    }
    setBusyRecipeId(recipeId);
    setNotice(null);
    try {
      await updateEventRecipe(eventId, recipeId, value);
      setNotice({ type: "success", text: "Portionen aktualisiert." });
      reload();
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Speichern fehlgeschlagen",
      });
    } finally {
      setBusyRecipeId(null);
    }
  };

  const handleRemoveRecipe = async (recipeId: number, name: string) => {
    if (!window.confirm(`Rezept „${name}" vom Anlass entfernen?`)) return;
    setBusyRecipeId(recipeId);
    setNotice(null);
    try {
      await unlinkEventRecipe(eventId, recipeId);
      setNotice({ type: "success", text: "Rezept entfernt." });
      reload();
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Entfernen fehlgeschlagen",
      });
    } finally {
      setBusyRecipeId(null);
    }
  };

  const handleAddRecipe = async () => {
    const rid = Number(newRecipeId);
    const servings = Math.floor(num(newRecipeServings));
    if (!rid) {
      setNotice({ type: "error", text: "Bitte ein Rezept waehlen." });
      return;
    }
    if (!(servings >= 1)) {
      setNotice({ type: "error", text: "Portionen muss mindestens 1 sein." });
      return;
    }
    setAddingRecipe(true);
    setNotice(null);
    try {
      await linkEventRecipe(eventId, rid, servings);
      setNewRecipeId("");
      setNewRecipeServings("1");
      setNotice({ type: "success", text: "Rezept hinzugefuegt." });
      reload();
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Hinzufuegen fehlgeschlagen",
      });
    } finally {
      setAddingRecipe(false);
    }
  };

  const handleRemoveManual = async (itemId: number, name: string) => {
    if (!window.confirm(`Material „${name}" vom Anlass entfernen?`)) return;
    setBusyItemId(itemId);
    setNotice(null);
    try {
      await removeManualItem(eventId, itemId);
      setNotice({ type: "success", text: "Material entfernt." });
      reload();
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Entfernen fehlgeschlagen",
      });
    } finally {
      setBusyItemId(null);
    }
  };

  const handleAddManual = async () => {
    const iid = Number(newItemId);
    const quantity = num(newItemQty);
    if (!iid) {
      setNotice({ type: "error", text: "Bitte ein Material waehlen." });
      return;
    }
    if (!(quantity > 0)) {
      setNotice({ type: "error", text: "Menge muss groesser als 0 sein." });
      return;
    }
    setAddingItem(true);
    setNotice(null);
    try {
      await addManualItem(eventId, iid, quantity);
      setNewItemId("");
      setNewItemQty("1");
      setNotice({ type: "success", text: "Material hinzugefuegt." });
      reload();
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Hinzufuegen fehlgeschlagen",
      });
    } finally {
      setAddingItem(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-md text-sm",
            notice.type === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          )}
        >
          {notice.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle className="h-4 w-4 shrink-0" />
          )}
          {notice.text}
          <button
            onClick={() => setNotice(null)}
            className="ml-auto opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Verknuepfte Rezepte */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <ChefHat className="h-4 w-4" />
          Rezepte ({recipes.length})
        </h3>

        {recipes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Rezepte verknuepft.
          </p>
        ) : (
          <div className="space-y-2">
            {recipes.map((r) => {
              const rid = recipeIdOf(r);
              const draft = servingsDraft[rid] ?? String(num(r.servings));
              const changed = Math.floor(num(draft)) !== num(r.servings);
              const busy = busyRecipeId === rid;
              return (
                <div
                  key={rid}
                  className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    {r.category_name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {r.category_name}
                      </p>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Portionen
                    <input
                      type="number"
                      min={1}
                      value={draft}
                      disabled={busy}
                      onChange={(e) =>
                        setServingsDraft((prev) => ({
                          ...prev,
                          [rid]: e.target.value,
                        }))
                      }
                      className="w-20 px-2 py-1 rounded-md border border-input bg-background text-sm text-foreground disabled:opacity-50"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSaveServings(rid)}
                    disabled={busy || !changed}
                    title="Portionen speichern"
                    className="rounded-md p-1.5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveRecipe(rid, r.name)}
                    disabled={busy}
                    title="Rezept entfernen"
                    className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Rezept hinzufuegen */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select
            value={newRecipeId}
            onChange={(e) => setNewRecipeId(e.target.value)}
            disabled={addingRecipe || selectableRecipes.length === 0}
            className="min-w-[180px] flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm disabled:opacity-50"
          >
            <option value="">
              {selectableRecipes.length === 0
                ? "Keine weiteren Rezepte"
                : "Rezept waehlen …"}
            </option>
            {selectableRecipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.category_name ? ` (${r.category_name})` : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={newRecipeServings}
            onChange={(e) => setNewRecipeServings(e.target.value)}
            disabled={addingRecipe}
            title="Portionen"
            className="w-20 px-2 py-2 rounded-md border border-input bg-background text-sm disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleAddRecipe}
            disabled={addingRecipe || !newRecipeId}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {addingRecipe ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Rezept
          </button>
        </div>
      </div>

      {/* Manuelle Materialien */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Package className="h-4 w-4" />
          Manuelle Materialien ({manualItems.length})
        </h3>

        {manualItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine manuellen Materialien erfasst.
          </p>
        ) : (
          <div className="space-y-2">
            {manualItems.map((m) => {
              const busy = busyItemId === m.item_id;
              return (
                <div
                  key={m.item_id}
                  className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-sm font-medium truncate">
                    {m.item_name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {qty(m.manual_needed, m.unit)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveManual(m.item_id, m.item_name)}
                    disabled={busy}
                    title="Material entfernen"
                    className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Material hinzufuegen */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <select
            value={newItemId}
            onChange={(e) => setNewItemId(e.target.value)}
            disabled={addingItem || selectableItems.length === 0}
            className="min-w-[180px] flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm disabled:opacity-50"
          >
            <option value="">
              {selectableItems.length === 0
                ? "Keine weiteren Materialien"
                : "Material waehlen …"}
            </option>
            {selectableItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.unit ? ` (${i.unit})` : ""}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step="any"
            value={newItemQty}
            onChange={(e) => setNewItemQty(e.target.value)}
            disabled={addingItem}
            title="Menge"
            className="w-20 px-2 py-2 rounded-md border border-input bg-background text-sm disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleAddManual}
            disabled={addingItem || !newItemId}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {addingItem ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Material
          </button>
        </div>
      </div>

      {/* Benoetigte Materialien (Abgleich mit Lager) */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Benoetigte Materialien ({items.length})
          </h3>
          {shopping && (
            <p className="text-xs text-muted-foreground">
              {missingCount} fehlen · geschaetzt offen{" "}
              <span className="font-medium text-foreground">
                CHF {num(shopping.estimated_open_cost).toFixed(2)}
              </span>{" "}
              / total CHF {num(shopping.estimated_total_cost).toFixed(2)}
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Kein Bedarf — es sind weder Rezepte noch Materialien erfasst.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 font-medium text-right">Benoetigt</th>
                  <th className="px-3 py-2 font-medium text-right">Am Lager</th>
                  <th className="px-3 py-2 font-medium text-right">Fehlt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const toBuy = num(i.to_buy);
                  const missing = toBuy > 0;
                  return (
                    <tr
                      key={i.item_id}
                      className={cn(
                        "border-b last:border-0",
                        missing && "bg-destructive/5"
                      )}
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium">{i.item_name}</span>
                        {i.unit && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({i.unit})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {qty(i.needed)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {qty(i.in_stock)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums font-medium",
                          missing ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {missing ? qty(toBuy) : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
