// Typen fuer das Event-Modul "Rezepte & Material". Zahlenwerte koennen vom
// Backend als String ODER Number geliefert werden (PG-numeric) — daher immer
// `Number(x)` vor Rechnen/`toFixed`. Deshalb hier `number | string`.

type Numeric = number | string;

/** Ein mit dem Event verknuepftes Rezept (GET /events/{id}/recipes). */
export interface EventRecipe {
  /** Rezept-ID (r.id). Fuer PUT/DELETE genutzt. */
  id: number;
  /** Manche Antworten liefern zusaetzlich recipe_id — dann bevorzugen. */
  recipe_id?: number;
  /** ID der Verknuepfung (event_recipes.id) — nur informativ. */
  link_id?: number;
  name: string;
  /** Portionen fuer diesen Anlass. */
  servings: Numeric;
  category_name?: string | null;
  /** Aktuell aus dem Lager herstellbare Portionen. */
  available_portions?: Numeric | null;
}

/** Ein auswaehlbares Rezept (GET /events/{id}/available-recipes). */
export interface AvailableRecipe {
  id: number;
  name: string;
  category_name?: string | null;
  available_portions?: Numeric | null;
}

/** Ein auswaehlbares Material (GET /events/{id}/available-items). */
export interface AvailableItem {
  id: number;
  name: string;
  unit?: string | null;
  quantity?: Numeric | null;
  category_name?: string | null;
}

/** Eine Position der Einkaufsliste (GET /events/{id}/shopping-list). */
export interface ShoppingListItem {
  item_id: number;
  item_name: string;
  unit?: string | null;
  /** Gesamtbedarf = recipe_needed + manual_needed. */
  needed: Numeric;
  /** Bedarf aus verknuepften Rezepten. */
  recipe_needed: Numeric;
  /** Bedarf aus manuell erfassten Positionen. */
  manual_needed: Numeric;
  /** Aktueller Lagerbestand. */
  in_stock: Numeric;
  /** Fehlmenge (needed - in_stock, min. 0) — das, was eingekauft werden muss. */
  to_buy: Numeric;
  purchase_price?: Numeric | null;
  supplier?: string | null;
  estimated_cost?: Numeric | null;
  purchased?: boolean;
}

/** Antwort der Einkaufsliste inkl. Summen. */
export interface ShoppingList {
  event_slug?: string;
  items: ShoppingListItem[];
  total_items: number;
  total_to_buy: number;
  estimated_total_cost: Numeric;
  estimated_open_cost: Numeric;
}
