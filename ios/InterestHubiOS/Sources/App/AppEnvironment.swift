import Foundation

struct AppEnvironment {
    let apiBaseURL: URL
    let supabaseURL: URL
    let supabaseAnonKey: String
    let magicLinkRedirectURL: URL

    static func load() -> AppEnvironment {
        guard
            let api = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
            let apiBaseURL = URL(string: api),
            let supabase = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let supabaseURL = URL(string: supabase),
            let anonKey = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            let redirect = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_MAGIC_LINK_REDIRECT_URL") as? String,
            let redirectURL = URL(string: redirect)
        else {
            fatalError("Missing required Info.plist keys for app environment.")
        }

        return AppEnvironment(
            apiBaseURL: apiBaseURL,
            supabaseURL: supabaseURL,
            supabaseAnonKey: anonKey,
            magicLinkRedirectURL: redirectURL
        )
    }
}
