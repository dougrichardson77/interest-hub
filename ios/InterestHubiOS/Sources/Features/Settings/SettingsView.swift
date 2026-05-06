import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var authStore: AuthStore

    var body: some View {
        Form {
            Section("Account") {
                if let email = authStore.session?.email {
                    Label(email, systemImage: "person.crop.circle")
                } else {
                    Label("Signed in", systemImage: "person.crop.circle")
                }

                Button("Sign Out", role: .destructive) {
                    authStore.signOut()
                }
            }

            Section("App") {
                Text("Magic-link auth and API sessions are stored securely in Keychain.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
    }
}
