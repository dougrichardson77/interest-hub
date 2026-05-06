import Foundation

struct AuthSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresAt: Date
    let email: String?

    var isExpired: Bool {
        expiresAt.timeIntervalSinceNow <= 60
    }

    static func fromSupabasePayload(_ payload: SupabaseTokenResponse) -> AuthSession {
        AuthSession(
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken,
            tokenType: payload.tokenType,
            expiresAt: Date().addingTimeInterval(TimeInterval(payload.expiresIn)),
            email: payload.user?.email
        )
    }

    static func fromCallbackURL(_ url: URL) -> AuthSession? {
        let fragmentParams = URLFragmentParser.parse(url.fragment)
        let queryParams = URLFragmentParser.parse(url.query)
        let params = queryParams.merging(fragmentParams) { _, newValue in newValue }

        guard
            let accessToken = params["access_token"],
            let refreshToken = params["refresh_token"],
            let expiresInValue = params["expires_in"],
            let expiresIn = Int(expiresInValue)
        else {
            return nil
        }

        let tokenType = params["token_type"] ?? "bearer"
        return AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            tokenType: tokenType,
            expiresAt: Date().addingTimeInterval(TimeInterval(expiresIn)),
            email: params["email"]
        )
    }
}

struct SupabaseTokenResponse: Decodable {
    struct User: Decodable {
        let email: String?
    }

    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresIn: Int
    let user: User?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case user
    }
}

private enum URLFragmentParser {
    static func parse(_ value: String?) -> [String: String] {
        guard let value else { return [:] }

        return value
            .split(separator: "&")
            .compactMap { pair -> (String, String)? in
                let parts = pair.split(separator: "=", maxSplits: 1)
                guard parts.count == 2 else { return nil }
                let key = String(parts[0]).removingPercentEncoding ?? String(parts[0])
                let decoded = String(parts[1]).removingPercentEncoding ?? String(parts[1])
                return (key, decoded)
            }
            .reduce(into: [:]) { result, pair in
                result[pair.0] = pair.1
            }
    }
}
