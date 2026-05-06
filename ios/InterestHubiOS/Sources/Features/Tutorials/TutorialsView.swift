import SwiftUI

struct TutorialsView: View {
    @EnvironmentObject private var tutorialsViewModel: TutorialsViewModel
    @EnvironmentObject private var interestsViewModel: InterestsViewModel

    @State private var showingPlayback = false

    var body: some View {
        VStack(spacing: 0) {
            filtersBar

            if tutorialsViewModel.isLoading {
                ProgressView("Loading tutorials...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if tutorialsViewModel.tutorials.isEmpty {
                ContentUnavailableView(
                    "No videos yet",
                    systemImage: "play.rectangle",
                    description: Text("Refresh your active interest to fetch the latest tutorials.")
                )
            } else {
                List(tutorialsViewModel.tutorials) { tutorial in
                    TutorialRow(
                        tutorial: tutorial,
                        isSelected: tutorial.videoId == tutorialsViewModel.selectedVideoId,
                        onToggleSaved: {
                            Task { await tutorialsViewModel.toggle(field: "saved", for: tutorial) }
                        },
                        onToggleWatched: {
                            Task { await tutorialsViewModel.toggle(field: "watched", for: tutorial) }
                        }
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        tutorialsViewModel.selectedVideoId = tutorial.videoId
                        showingPlayback = true
                    }
                }
                .listStyle(.plain)
            }

            if let message = tutorialsViewModel.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding()
            }
        }
        .searchable(text: $tutorialsViewModel.filters.search, placement: .navigationBarDrawer(displayMode: .always))
        .onSubmit(of: .search) {
            Task { await tutorialsViewModel.refreshFromCurrentFilters() }
        }
        .sheet(isPresented: $showingPlayback) {
            if let selected = tutorialsViewModel.selectedTutorial {
                PlaybackView(tutorial: selected)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        tutorialsViewModel.activeInterestId = interestsViewModel.activeInterestId
                        await tutorialsViewModel.runRefresh()
                    }
                } label: {
                    if tutorialsViewModel.isRefreshing {
                        ProgressView()
                    } else {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                }
            }
        }
    }

    private var filtersBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                Picker("Saved", selection: $tutorialsViewModel.filters.saved) {
                    Text("Saved: All").tag("all")
                    Text("Saved: Yes").tag("true")
                    Text("Saved: No").tag("false")
                }
                .pickerStyle(.menu)

                Picker("Watched", selection: $tutorialsViewModel.filters.watched) {
                    Text("Watched: All").tag("all")
                    Text("Watched: Yes").tag("true")
                    Text("Watched: No").tag("false")
                }
                .pickerStyle(.menu)

                Picker("Duration", selection: $tutorialsViewModel.filters.duration) {
                    Text("Any length").tag("all")
                    Text("Under 10m").tag("short")
                    Text("10-30m").tag("medium")
                    Text("30m+").tag("long")
                }
                .pickerStyle(.menu)

                Button("Apply") {
                    Task { await tutorialsViewModel.refreshFromCurrentFilters() }
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color(.secondarySystemBackground))
    }
}

private struct TutorialRow: View {
    let tutorial: Tutorial
    let isSelected: Bool
    let onToggleSaved: () -> Void
    let onToggleWatched: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                AsyncImage(url: URL(string: tutorial.thumbnailUrl)) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        Rectangle().fill(Color(.tertiarySystemFill))
                    }
                }
                .frame(width: 118, height: 68)
                .clipShape(RoundedRectangle(cornerRadius: 8))

                VStack(alignment: .leading, spacing: 4) {
                    Text(tutorial.title)
                        .font(.headline)
                        .lineLimit(2)

                    Text(tutorial.channelTitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        if tutorial.trustedChannel {
                            Label("Trusted", systemImage: "checkmark.seal.fill")
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                        Text(tutorial.durationLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            HStack(spacing: 12) {
                Button(tutorial.saved ? "Saved" : "Save", action: onToggleSaved)
                    .buttonStyle(.bordered)

                Button(tutorial.watched ? "Watched" : "Mark Watched", action: onToggleWatched)
                    .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
        .overlay(alignment: .leading) {
            if isSelected {
                Rectangle()
                    .fill(Color.accentColor)
                    .frame(width: 3)
            }
        }
    }
}
