import Foundation

struct SearchQuery: Codable, Identifiable, Equatable {
    let query: String
    let tags: [String]

    var id: String { query }
}

struct TopicRule: Codable, Equatable {
    let tag: String
    let keywords: [String]
}

struct Interest: Codable, Identifiable, Equatable {
    let id: String
    let slug: String?
    let name: String
    let shortName: String
    let description: String
    let color: String
    let searchQueries: [SearchQuery]
    let topicRules: [TopicRule]
    let trustedChannels: [String]
    let excludeKeywords: [String]?
    let lastRefreshedAt: String?
    let lastRefreshStatus: String?
    let lastRefreshError: String?
    let videoCount: Int?
}

struct InterestsResponse: Decodable {
    let activeInterestId: String
    let interests: [Interest]
}

struct AppConfigResponse: Decodable {
    let authEnabled: Bool
    let storageMode: String
    let supabaseUrl: String
    let supabaseAnonKey: String
}
