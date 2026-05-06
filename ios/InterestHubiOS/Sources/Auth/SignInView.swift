import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var authStore: AuthStore

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Sign in")
                .font(.largeTitle.weight(.bold))

            Text("Use your email magic link to open your private tutorial dashboard.")
                .font(.body)
                .foregroundStyle(.secondary)

            TextField("you@example.com", text: $authStore.email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .keyboardType(.emailAddress)
                .textFieldStyle(.roundedBorder)

            Button {
                Task {
                    await authStore.sendMagicLink()
                }
            } label: {
                if authStore.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Send Magic Link")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(authStore.isLoading)

            if !authStore.statusMessage.isEmpty {
                Text(authStore.statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding()
    }
}
