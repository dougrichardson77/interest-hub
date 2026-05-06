import Foundation

struct TutorialFilters: Equatable {
    var search: String = ""
    var topic: String = "all"
    var channel: String = "all"
    var saved: String = "all"
    var watched: String = "all"
    var duration: String = "all"
    var quality: String = "all"

    func asQueryItems(with interestId: String?) -> [URLQueryItem] {
        var items: [URLQueryItem] = []

        if let interestId {
            items.append(URLQueryItem(name: "interestId", value: interestId))
        }

        if !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(URLQueryItem(name: "search", value: search))
        }
        if topic != "all" { items.append(URLQueryItem(name: "topic", value: topic)) }
        if channel != "all" { items.append(URLQueryItem(name: "channel", value: channel)) }
        if saved != "all" { items.append(URLQueryItem(name: "saved", value: saved)) }
        if watched != "all" { items.append(URLQueryItem(name: "watched", value: watched)) }
        if duration != "all" { items.append(URLQueryItem(name: "duration", value: duration)) }
        if quality != "all" { items.append(URLQueryItem(name: "quality", value: quality)) }

        return items
    }
}

@MainActor
final class TutorialsViewModel: ObservableObject {
    @Published private(set) var tutorials: [Tutorial] = []
    @Published private(set) var facets = TutorialFacets(topics: [], channels: [])
    @Published private(set) var meta: TutorialsMeta?
    @Published var filters = TutorialFilters()
    @Published var selectedVideoId: String?
    @Published var isRefreshing: Bool = false
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var activeInterestId: String?

    private let apiClient: APIClient
    private let authStore: AuthStore

    init(apiClient: APIClient, authStore: AuthStore) {
        self.apiClient = apiClient
        self.authStore = authStore
    }

    func setActiveInterest(_ interestId: String?) async {
        activeInterestId = interestId
        selectedVideoId = nil
        await refreshFromCurrentFilters()
    }

    func refreshFromCurrentFilters() async {
        guard authStore.session != nil else {
            tutorials = []
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let payload = try await apiClient.request(
                TutorialsResponse.self,
                path: "/api/tutorials",
                queryItems: filters.asQueryItems(with: activeInterestId)
            )
            tutorials = payload.tutorials
            facets = payload.facets
            meta = payload.meta
            if !tutorials.contains(where: { $0.videoId == selectedVideoId }) {
                selectedVideoId = tutorials.first?.videoId
            }
        } catch {
            errorMessage = describe(error)
        }
    }

    func runRefresh() async {
        guard let interestId = activeInterestId else { return }

        isRefreshing = true
        errorMessage = nil
        defer { isRefreshing = false }

        do {
            _ = try await apiClient.request(
                TutorialsResponse.self,
                path: "/api/interests/\(interestId)/refresh",
                method: .post
            )
            await refreshFromCurrentFilters()
        } catch {
            errorMessage = describe(error)
        }
    }

    func toggle(field: String, for tutorial: Tutorial) async {
        let nextValue: Bool
        if field == "saved" {
            nextValue = !tutorial.saved
        } else {
            nextValue = !tutorial.watched
        }

        do {
            let payload = try await apiClient.request(
                TutorialStateResponse.self,
                path: "/api/tutorials/\(tutorial.videoId)/state",
                method: .patch,
                jsonBody: [field: nextValue]
            )
            tutorials = tutorials.map { item in
                item.videoId == payload.tutorial.videoId ? payload.tutorial : item
            }
        } catch {
            errorMessage = describe(error)
        }
    }

    var selectedTutorial: Tutorial? {
        tutorials.first(where: { $0.videoId == selectedVideoId })
    }

    private func describe(_ error: Error) -> String {
        if let apiError = error as? APIClientError {
            switch apiError {
            case .server(let serverError):
                return serverError.message
            case .unauthorized:
                return "Please sign in again."
            case .transport(let message):
                return message
            case .invalidResponse:
                return "Unexpected API response."
            }
        }

        return error.localizedDescription
    }
}
