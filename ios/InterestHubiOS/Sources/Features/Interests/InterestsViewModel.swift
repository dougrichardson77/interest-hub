import Foundation

@MainActor
final class InterestsViewModel: ObservableObject {
    @Published private(set) var interests: [Interest] = []
    @Published var activeInterestId: String?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let apiClient: APIClient
    private let authStore: AuthStore

    init(apiClient: APIClient, authStore: AuthStore) {
        self.apiClient = apiClient
        self.authStore = authStore
    }

    func loadInterestsIfNeeded() async {
        guard !isLoading, interests.isEmpty else { return }
        await loadInterests(force: true)
    }

    func loadInterests(force: Bool = false) async {
        guard authStore.session != nil else {
            interests = []
            activeInterestId = nil
            return
        }

        if isLoading, !force { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let payload = try await apiClient.request(InterestsResponse.self, path: "/api/interests")
            interests = payload.interests
            activeInterestId = payload.activeInterestId
        } catch {
            errorMessage = describe(error)
        }
    }

    func setActiveInterest(_ interestId: String) async {
        do {
            let payload = try await apiClient.request(
                InterestsResponse.self,
                path: "/api/interests/\(interestId)",
                method: .patch,
                jsonBody: ["active": true]
            )
            interests = payload.interests
            activeInterestId = payload.activeInterestId
        } catch {
            errorMessage = describe(error)
        }
    }

    func addInterest(name: String, searchQueries: [String], topics: [String], trustedChannels: [String]) async {
        do {
            let payload = try await apiClient.request(
                InterestsResponse.self,
                path: "/api/interests",
                method: .post,
                jsonBody: [
                    "name": name,
                    "searchQueries": searchQueries,
                    "topics": topics,
                    "trustedChannels": trustedChannels
                ]
            )
            interests = payload.interests
            activeInterestId = payload.activeInterestId
        } catch {
            errorMessage = describe(error)
        }
    }

    func deleteInterest(_ interestId: String) async {
        do {
            let payload = try await apiClient.request(
                InterestsResponse.self,
                path: "/api/interests/\(interestId)",
                method: .delete
            )
            interests = payload.interests
            activeInterestId = payload.activeInterestId
        } catch {
            errorMessage = describe(error)
        }
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
