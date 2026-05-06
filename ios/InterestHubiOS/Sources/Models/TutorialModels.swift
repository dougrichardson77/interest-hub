import Foundation

struct Tutorial: Codable, Identifiable, Equatable {
    var id: String { videoId }

    let videoId: String
    let title: String
    let description: String
    let channelId: String
    let channelTitle: String
    let publishedAt: String?
    let thumbnailUrl: String
    let sourceQueries: [String]
    let queryTags: [String]
    let durationSeconds: Int
    let durationLabel: String
    let viewCount: Int?
    let likeCount: Int?
    let embeddable: Bool
    let tags: [String]
    let trustedChannel: Bool
    let url: String
    let embedUrl: String
    let fetchedAt: String?
    let saved: Bool
    let watched: Bool
    let notes: String
    let relevanceScore: Int?
    let interestIds: [String]
}

struct TutorialFacets: Codable {
    let topics: [String]
    let channels: [String]
}

struct TutorialsMeta: Codable {
    let interest: Interest
    let total: Int
    let filtered: Int
    let lastRefreshedAt: String?
    let lastRefreshStatus: String?
    let lastRefreshError: String?
    let searchQueries: [String]
    let apiConfigured: Bool
    let autoRefresh: Bool
    let storageMode: String
    let refreshEveryHours: Double
}

struct TutorialsResponse: Codable {
    let tutorials: [Tutorial]
    let facets: TutorialFacets
    let meta: TutorialsMeta
}

struct TutorialStateResponse: Codable {
    let tutorial: Tutorial
}
