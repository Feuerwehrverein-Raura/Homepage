import SwiftUI

/// Rezepte, Material und Einkaufsliste eines Anlasses.
///
/// Das Events-Backend reicht diese Daten nur an die Inventar-API durch. Die
/// Einkaufsliste wird dort aus den verknüpften Rezepten **und** den manuell
/// erfassten Posten gegen den Lagerbestand gerechnet — die App zeigt sie nur
/// an, sie rechnet nichts selbst nach.
struct EventMaterialsView: View {
    @EnvironmentObject var auth: AuthManager
    let event: Event

    @State private var recipes: [LinkedRecipe] = []
    @State private var shopping: ShoppingList?
    @State private var loading = true
    @State private var error: String?
    @State private var addingRecipe = false
    @State private var addingItem = false
    @State private var servingsFor: LinkedRecipe?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle).foregroundStyle(.secondary)
                    Text(error).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    Section {
                        if recipes.isEmpty {
                            Text("Keine Rezepte verknüpft.")
                                .font(.footnote).foregroundStyle(.secondary)
                        } else {
                            ForEach(recipes) { recipe in
                                Button {
                                    servingsFor = recipe
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(recipe.name ?? "Rezept")
                                                .foregroundStyle(.primary)
                                            if let category = recipe.categoryName {
                                                Text(category).font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                        }
                                        Spacer()
                                        if let servings = recipe.servings {
                                            Text("\(servings.text) Port.")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                            .onDelete { indexes in
                                Task { await unlinkRecipes(indexes) }
                            }
                        }
                        Button {
                            addingRecipe = true
                        } label: {
                            Label("Rezept verknüpfen", systemImage: "plus")
                        }
                    } header: {
                        Text("Rezepte")
                    } footer: {
                        Text("Zum Lösen der Verknüpfung nach links wischen.")
                    }

                    Section {
                        Button {
                            addingItem = true
                        } label: {
                            Label("Material erfassen", systemImage: "plus")
                        }
                        ForEach(manualItems) { item in
                            HStack {
                                Text(item.itemName ?? "Position")
                                Spacer()
                                Text("\(item.manualNeeded?.text ?? "") \(item.unit ?? "")")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .onDelete { indexes in
                            Task { await removeManualItems(indexes) }
                        }
                    } header: {
                        Text("Material von Hand")
                    }

                    if let shopping, !shopping.items.isEmpty {
                        Section {
                            ForEach(shopping.items) { item in
                                ShoppingRow(item: item)
                            }
                        } header: {
                            HStack {
                                Text("Einkaufsliste")
                                Spacer()
                                if let count = shopping.totalToBuy {
                                    Text("\(count) zu kaufen")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        } footer: {
                            if let cost = shopping.estimatedTotalCost?.value {
                                Text("Geschätzte Kosten: CHF \(String(format: "%.2f", cost))")
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Rezepte & Material")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $addingRecipe) {
            PickRecipeSheet(event: event) { Task { await load() } }
                .environmentObject(auth)
        }
        .sheet(isPresented: $addingItem) {
            PickItemSheet(event: event) { Task { await load() } }
                .environmentObject(auth)
        }
        .sheet(item: $servingsFor) { recipe in
            ServingsSheet(event: event, recipe: recipe) { Task { await load() } }
                .environmentObject(auth)
        }
    }

    /// Manuell erfasste Posten stehen nicht in einer eigenen Liste — sie sind
    /// die Positionen der Einkaufsliste mit einem manuellen Bedarf.
    private var manualItems: [ShoppingItem] {
        (shopping?.items ?? []).filter(\.isManual)
    }

    private func load() async {
        loading = true
        error = nil
        do {
            let api = auth.api()
            recipes = (try? await api.get("events/\(event.id)/recipes")) ?? []
            shopping = try await api.get("events/\(event.id)/shopping-list")
        } catch {
            self.error = "Rezepte und Material konnten nicht geladen werden."
        }
        loading = false
    }

    private func unlinkRecipes(_ indexes: IndexSet) async {
        for index in indexes {
            guard let recipeId = recipes[index].effectiveRecipeId else { continue }
            try? await auth.api().delete("events/\(event.id)/recipes/\(recipeId)")
        }
        await load()
    }

    private func removeManualItems(_ indexes: IndexSet) async {
        let items = manualItems
        for index in indexes {
            guard let itemId = items[index].itemId else { continue }
            try? await auth.api().delete("events/\(event.id)/manual-items/\(itemId)")
        }
        await load()
    }
}

private struct ShoppingRow: View {
    let item: ShoppingItem

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(item.itemName ?? "Position")
                    .font(.subheadline)
                Spacer()
                if let toBuy = item.toBuy?.value, toBuy > 0 {
                    Text("\(item.toBuy?.text ?? "") \(item.unit ?? "")")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.orange)
                } else {
                    Image(systemName: "checkmark")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
            HStack(spacing: 8) {
                if let needed = item.needed {
                    Text("Bedarf \(needed.text)")
                }
                if let stock = item.inStock {
                    Text("· Lager \(stock.text)")
                }
                if let supplier = item.supplier, !supplier.isEmpty {
                    Text("· \(supplier)")
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// Rezept auswählen und mit Portionen verknüpfen.
private struct PickRecipeSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    var onLinked: () -> Void

    @State private var available: [AvailableRecipe] = []
    @State private var search = ""
    @State private var selected: AvailableRecipe?
    @State private var servings = 20
    @State private var busy = false

    private var filtered: [AvailableRecipe] {
        guard !search.isEmpty else { return available }
        return available.filter {
            ($0.name ?? "").localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                if selected == nil {
                    Section {
                        TextField("Suchen", text: $search)
                        ForEach(filtered.prefix(40)) { recipe in
                            Button {
                                selected = recipe
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(recipe.name ?? "Rezept")
                                        .foregroundStyle(.primary)
                                    if let category = recipe.categoryName {
                                        Text(category).font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    } header: {
                        Text(available.isEmpty ? "Wird geladen …" : "Rezept")
                    }
                } else {
                    Section("Portionen") {
                        LabeledContent("Rezept", value: selected?.name ?? "")
                        Stepper("\(servings) Portionen", value: $servings, in: 1...500, step: 5)
                        Button("Andere Auswahl") { selected = nil }
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Rezept verknüpfen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else {
                        Button("Verknüpfen") { Task { await link() } }
                            .disabled(selected == nil)
                    }
                }
            }
            .task {
                available = (try? await auth.api()
                    .get("events/\(event.id)/available-recipes")) ?? []
            }
        }
    }

    private func link() async {
        guard let selected else { return }
        busy = true
        defer { busy = false }
        let _: PublicRegistrationResponse? = try? await auth.api().post(
            "events/\(event.id)/recipes",
            body: LinkRecipeRequest(recipeId: selected.id, servings: servings))
        onLinked()
        dismiss()
    }
}

/// Portionen einer bestehenden Verknüpfung ändern.
private struct ServingsSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    let recipe: LinkedRecipe
    var onChanged: () -> Void

    @State private var servings = 20
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section(recipe.name ?? "Rezept") {
                    Stepper("\(servings) Portionen", value: $servings, in: 1...500, step: 5)
                    if let available = recipe.availablePortions {
                        LabeledContent("Aus Lager möglich", value: available.text)
                    }
                }
            }
            .navigationTitle("Portionen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Sichern") { Task { await save() } }
                    }
                }
            }
            .onAppear {
                if let current = recipe.servings?.value { servings = Int(current) }
            }
        }
    }

    private func save() async {
        guard let recipeId = recipe.effectiveRecipeId else { return }
        busy = true
        defer { busy = false }
        try? await auth.api().put("events/\(event.id)/recipes/\(recipeId)",
                                  body: UpdateServingsRequest(servings: servings))
        onChanged()
        dismiss()
    }
}

/// Material von Hand erfassen.
private struct PickItemSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    var onAdded: () -> Void

    @State private var available: [AvailableItem] = []
    @State private var search = ""
    @State private var selected: AvailableItem?
    @State private var quantity = "1"
    @State private var busy = false

    private var filtered: [AvailableItem] {
        guard !search.isEmpty else { return available }
        return available.filter {
            ($0.name ?? "").localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                if selected == nil {
                    Section {
                        TextField("Suchen", text: $search)
                        ForEach(filtered.prefix(40)) { item in
                            Button {
                                selected = item
                            } label: {
                                HStack {
                                    Text(item.name ?? "Position")
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if let unit = item.unit {
                                        Text(unit).font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    } header: {
                        Text(available.isEmpty ? "Wird geladen …" : "Material")
                    }
                } else {
                    Section("Menge") {
                        LabeledContent("Position", value: selected?.name ?? "")
                        HStack {
                            TextField("Menge", text: $quantity)
                                .keyboardType(.decimalPad)
                            if let unit = selected?.unit {
                                Text(unit).foregroundStyle(.secondary)
                            }
                        }
                        Button("Andere Auswahl") { selected = nil }
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Material erfassen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else {
                        Button("Erfassen") { Task { await add() } }
                            .disabled(selected == nil || parsedQuantity == nil)
                    }
                }
            }
            .task {
                available = (try? await auth.api()
                    .get("events/\(event.id)/available-items")) ?? []
            }
        }
    }

    /// Komma wie Punkt akzeptieren — auf der Zehnertastatur liegt hier je
    /// nach Region das eine oder das andere.
    private var parsedQuantity: Double? {
        Double(quantity.replacingOccurrences(of: ",", with: "."))
    }

    private func add() async {
        guard let selected, let amount = parsedQuantity else { return }
        busy = true
        defer { busy = false }
        let _: PublicRegistrationResponse? = try? await auth.api().post(
            "events/\(event.id)/manual-items",
            body: AddManualItemRequest(itemId: selected.id, quantity: amount))
        onAdded()
        dismiss()
    }
}
