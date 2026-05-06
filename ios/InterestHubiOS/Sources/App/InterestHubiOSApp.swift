import SwiftUI

@main
struct InterestHubiOSApp: App {
    @StateObject private var authStore: AuthStore
    @StateObject private var tutorialsViewModel: TutorialsViewModel
    @StateObject private var interestsViewModel: InterestsViewModel

    init() {
        let environment = AppEnvironment.load()
        let authStore = AuthStore(environment: environment)
        let apiClient = APIClient(environment: environment, authStore: authStore)

        _authStore = StateObject(wrappedValue: authStore)
        _tutorialsViewModel = StateObject(wrappedValue: TutorialsViewModel(apiClient: apiClient, authStore: authStore))
        _interestsViewModel = StateObject(wrappedValue: InterestsViewModel(apiClient: apiClient, authStore: authStore))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authStore)
                .environmentObject(interestsViewModel)
                .environmentObject(tutorialsViewModel)
                .onOpenURL { url in
                    authStore.handleOpenURL(url)
                }
        }
    }
}
