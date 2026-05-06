import Foundation

final class APIClient {
    enum Method: String {
        case get = "GET"
        case post = "POST"
        case patch = "PATCH"
        case delete = "DELETE"
    }

    private let environment: AppEnvironment
    private let authStore: AuthStore
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(environment: AppEnvironment, authStore: AuthStore) {
        self.environment = environment
        self.authStore = authStore
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func request<T: Decodable>(
        _ type: T.Type = T.self,
        path: String,
        method: Method = .get,
        queryItems: [URLQueryItem] = [],
        jsonBody: [String: Any]? = nil,
        requiresAuth: Bool = true,
        retryingAfterRefresh: Bool = false
    ) async throws -> T {
        var components = URLComponents(url: environment.apiBaseURL.appending(path: path), resolvingAgainstBaseURL: false)
        if !queryItems.isEmpty {
            components?.queryItems = queryItems
        }

        guard let url = components?.url else {
            throw APIClientError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let jsonBody {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        }

        if requiresAuth {
            guard let token = await authStore.accessToken() else {
                throw APIClientError.unauthorized
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw APIClientError.invalidResponse
            }

            let envelope = try decoder.decode(APIEnvelope<T>.self, from: data)

            if (200...299).contains(http.statusCode), envelope.ok, let payload = envelope.data {
                return payload
            }

            if http.statusCode == 401, requiresAuth, !retryingAfterRefresh {
                let refreshed = await authStore.refreshSessionIfNeeded()
                if refreshed {
                    return try await request(
                        type,
                        path: path,
                        method: method,
                        queryItems: queryItems,
                        jsonBody: jsonBody,
                        requiresAuth: requiresAuth,
                        retryingAfterRefresh: true
                    )
                }
            }

            if let error = envelope.error {
                throw APIClientError.server(error)
            }

            throw APIClientError.invalidResponse
        } catch let error as APIClientError {
            throw error
        } catch {
            throw APIClientError.transport(error.localizedDescription)
        }
    }

    func requestTokenRefresh(refreshToken: String) async throws -> SupabaseTokenResponse {
        var request = URLRequest(url: environment.supabaseURL.appending(path: "/auth/v1/token?grant_type=refresh_token"))
        request.httpMethod = Method.post.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(environment.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(environment.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try encoder.encode(["refresh_token": refreshToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIClientError.unauthorized
        }

        return try decoder.decode(SupabaseTokenResponse.self, from: data)
    }
}
