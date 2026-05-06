import SwiftUI

struct InterestsView: View {
    @EnvironmentObject private var interestsViewModel: InterestsViewModel
    @EnvironmentObject private var tutorialsViewModel: TutorialsViewModel

    @State private var newInterestName: String = ""
    @State private var newInterestQueries: String = ""
    @State private var newInterestTopics: String = ""
    @State private var newInterestChannels: String = ""

    var body: some View {
        List {
            Section("Saved Interests") {
                ForEach(interestsViewModel.interests) { interest in
                    HStack {
                        Circle()
                            .fill(Color(hex: interest.color))
                            .frame(width: 10, height: 10)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(interest.name)
                                .font(.headline)
                            Text("\(interest.videoCount ?? 0) videos")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        if interestsViewModel.activeInterestId == interest.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        Task {
                            await interestsViewModel.setActiveInterest(interest.id)
                            await tutorialsViewModel.setActiveInterest(interest.id)
                        }
                    }
                    .swipeActions {
                        if interestsViewModel.interests.count > 1 {
                            Button(role: .destructive) {
                                Task {
                                    await interestsViewModel.deleteInterest(interest.id)
                                    await tutorialsViewModel.setActiveInterest(interestsViewModel.activeInterestId)
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }

            Section("Add Interest") {
                TextField("Name", text: $newInterestName)
                TextField("Search queries (comma separated)", text: $newInterestQueries)
                TextField("Topics (comma separated)", text: $newInterestTopics)
                TextField("Trusted channels (comma separated)", text: $newInterestChannels)

                Button("Add Interest") {
                    Task {
                        await interestsViewModel.addInterest(
                            name: newInterestName,
                            searchQueries: splitComma(newInterestQueries),
                            topics: splitComma(newInterestTopics),
                            trustedChannels: splitComma(newInterestChannels)
                        )
                        if let active = interestsViewModel.activeInterestId {
                            await tutorialsViewModel.setActiveInterest(active)
                        }
                        resetForm()
                    }
                }
                .disabled(newInterestName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if let error = interestsViewModel.errorMessage {
                Section {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Interests")
        .task {
            await interestsViewModel.loadInterestsIfNeeded()
        }
    }

    private func splitComma(_ input: String) -> [String] {
        input
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private func resetForm() {
        newInterestName = ""
        newInterestQueries = ""
        newInterestTopics = ""
        newInterestChannels = ""
    }
}
