import { apiClient } from "./client";
import type {
  EventRecipe,
  AvailableRecipe,
  AvailableItem,
  ShoppingList,
} from "@/lib/types/event-materials";

// DEUTSCH: Event-Modul "Rezepte & Material". Alle Endpunkte laufen ueber den
// Events-Backend-Proxy zur Inventar-API (Auth wie ueberall via apiClient/Bearer).

/** Mit dem Event verknuepfte Rezepte. */
export async function getEventRecipes(eventId: string): Promise<EventRecipe[]> {
  return await apiClient.get<EventRecipe[]>(`/events/${eventId}/recipes`);
}

/** Einkaufsliste (Rezepte + manuelle Materialien gegen Lager abgeglichen). */
export async function getShoppingList(eventId: string): Promise<ShoppingList> {
  return await apiClient.get<ShoppingList>(`/events/${eventId}/shopping-list`);
}

/** Alle auswaehlbaren Rezepte. */
export async function getAvailableRecipes(
  eventId: string
): Promise<AvailableRecipe[]> {
  return await apiClient.get<AvailableRecipe[]>(
    `/events/${eventId}/available-recipes`
  );
}

/** Alle auswaehlbaren Materialien. */
export async function getAvailableItems(
  eventId: string
): Promise<AvailableItem[]> {
  return await apiClient.get<AvailableItem[]>(
    `/events/${eventId}/available-items`
  );
}

/** Rezept mit dem Event verknuepfen (Upsert von Portionen). */
export async function linkEventRecipe(
  eventId: string,
  recipeId: number,
  servings: number
): Promise<void> {
  await apiClient.post(`/events/${eventId}/recipes`, {
    recipe_id: recipeId,
    servings,
  });
}

/** Portionen einer Verknuepfung aendern. */
export async function updateEventRecipe(
  eventId: string,
  recipeId: number,
  servings: number
): Promise<void> {
  await apiClient.put(`/events/${eventId}/recipes/${recipeId}`, { servings });
}

/** Verknuepfung loesen. */
export async function unlinkEventRecipe(
  eventId: string,
  recipeId: number
): Promise<void> {
  await apiClient.delete(`/events/${eventId}/recipes/${recipeId}`);
}

/** Manuelle Material-Position hinzufuegen (Upsert von Menge). */
export async function addManualItem(
  eventId: string,
  itemId: number,
  quantity: number
): Promise<void> {
  await apiClient.post(`/events/${eventId}/manual-items`, {
    item_id: itemId,
    quantity,
  });
}

/** Manuelle Material-Position entfernen. */
export async function removeManualItem(
  eventId: string,
  itemId: number
): Promise<void> {
  await apiClient.delete(`/events/${eventId}/manual-items/${itemId}`);
}
