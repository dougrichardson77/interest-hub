import SwiftUI

struct RootView: View {
    @EnvironmentObject private var authStore: AuthStore
    @EnvironmentObject private var interestsViewModel: InterestsViewModel
    @EnvironmentObject private var tutorialsViewModel: TutorialsViewModel

    var body: some View {
        NavigationStack {
            Group {
                if authStore.session == nil {
                    SignInView()
                } else {
                    TutorialsView()
                }
            }
            .navigationTitle("Interest Hub")
            .toolbar {
                if authStore.session != nil {
                    ToolbarItem(placement: .topBarLeading) {
                        NavigationLink {
                            InterestsView()
                        } label: {
                            Label("Interests", systemImage: "square.grid.2x2")
                        }
                    }

                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            SettingsView()
                        } label: {
                            Label("Settings", systemImage: "gearshape")
                        }
                    }
                }
            }
        }
        .task(id: authStore.session?.accessToken) {
            guard authStore.session != nil else { return }
            await interestsViewModel.loadInterestsIfNeeded()
            await tutorialsViewModel.setActiveInterest(interestsViewModel.activeInterestId)
        }
    }
}
