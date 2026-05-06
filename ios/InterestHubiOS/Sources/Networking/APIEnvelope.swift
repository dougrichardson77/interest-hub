import Foundation

struct APIEnvelope<T: Decodable>: Decodable {
    let ok: Bool
    let data: T?
    let error: APIErrorBody?
    let meta: APIMeta?
}

struct APIMeta: Decodable {
    let requestId: String?
    let appVersion: String?
    let timestamp: String?
}

struct APIErrorBody: Decodable, Error {
    let code: String
    let message: String
}

enum APIClientError: Error {
    case unauthorized
    case invalidResponse
    case server(APIErrorBody)
    case transport(String)
}

struct EmptyResponse: Decodable {}
