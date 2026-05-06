import XCTest
@testable import InterestHubiOS

final class InterestHubiOSTests: XCTestCase {
    func testMagicLinkCallbackParserBuildsSession() {
        let url = URL(string: "interesthub://auth/callback#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&email=test@example.com")!
        let session = AuthSession.fromCallbackURL(url)

        XCTAssertEqual(session?.accessToken, "a")
        XCTAssertEqual(session?.refreshToken, "b")
        XCTAssertEqual(session?.tokenType, "bearer")
        XCTAssertEqual(session?.email, "test@example.com")
    }

    func testTutorialFilterQueryItems() {
        var filters = TutorialFilters()
        filters.search = "Codex"
        filters.saved = "true"

        let items = filters.asQueryItems(with: "openai-codex")
        XCTAssertTrue(items.contains(URLQueryItem(name: "interestId", value: "openai-codex")))
        XCTAssertTrue(items.contains(URLQueryItem(name: "search", value: "Codex")))
        XCTAssertTrue(items.contains(URLQueryItem(name: "saved", value: "true")))
    }
}
