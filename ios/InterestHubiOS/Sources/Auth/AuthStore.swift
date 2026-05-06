import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published var email: String = ""
    @Published var statusMessage: String = ""
    @Published var isLoading: Bool = false
    @Published private(set) var session: AuthSession?

    private let environment: AppEnvironment
    private let keychain: KeychainStore
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let sessionStorageKey = "interest-hub-auth-session"

    init(environment: AppEnvironment, keychain: KeychainStore = KeychainStore()) {
        self.environment = environment
        self.keychain = keychain
        self.session = loadSession()
    }

    func sendMagicLink() async {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty else {
            statusMessage = "Enter an email address first."
            return
        }

        isLoading = true
        defer { isLoading = false }

        var request = URLRequest(url: environment.supabaseURL.appending(path: "/auth/v1/otp"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(environment.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(environment.supabaseAnonKey)", forHTTPHeaderField: "Authorization")

        let payload: [String: Any] = [
            "email": trimmedEmail,
            "create_user": true,
            "data": [:],
            "options": [
                "emailRedirectTo": environment.magicLinkRedirectURL.absoluteString,
                "email_redirect_to": environment.magicLinkRedirectURL.absoluteString
            ]
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                statusMessage = "Could not send magic link. Check your Supabase Auth settings."
                return
            }
            statusMessage = "Magic link sent. Open it on this iPhone to finish sign-in."
        } catch {
            statusMessage = "Could not send magic link: \(error.localizedDescription)"
        }
    }

    func handleOpenURL(_ url: URL) {
        guard url.scheme == environment.magicLinkRedirectURL.scheme else { return }

        guard let nextSession = AuthSession.fromCallbackURL(url) else {
            statusMessage = "Sign-in link opened, but no tokens were found."
            return
        }

        setSession(nextSession)
        statusMessage = "Signed in successfully."
    }

    func signOut() {
        session = nil
        statusMessage = "Signed out."
        try? keychain.delete(key: sessionStorageKey)
    }

    func accessToken() async -> String? {
        if session?.isExpired == true {
            _ = await refreshSessionIfNeeded()
        }
        return session?.accessToken
    }

    func refreshSessionIfNeeded() async -> Bool {
        guard let current = session else { return false }
        guard current.isExpired else { return true }

        var request = URLRequest(url: environment.supabaseURL.appending(path: "/auth/v1/token?grant_type=refresh_token"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(environment.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(environment.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["refresh_token": current.refreshToken])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                signOut()
                return false
            }

            let payload = try decoder.decode(SupabaseTokenResponse.self, from: data)
            setSession(AuthSession.fromSupabasePayload(payload))
            return true
        } catch {
            signOut()
            return false
        }
    }

    private func loadSession() -> AuthSession? {
        guard let data = try? keychain.load(key: sessionStorageKey) else { return nil }
        guard let data else { return nil }
        return try? decoder.decode(AuthSession.self, from: data)
    }

    private func setSession(_ nextSession: AuthSession) {
        session = nextSession

        guard let data = try? encoder.encode(nextSession) else { return }
        try? keychain.save(data: data, for: sessionStorageKey)
    }
}
