import SwiftUI
import WebKit

struct PlaybackView: View {
    let tutorial: Tutorial

    var body: some View {
        NavigationStack {
            Group {
                if tutorial.embeddable, let url = URL(string: tutorial.embedUrl) {
                    EmbeddedWebView(url: url)
                } else if let url = URL(string: tutorial.url) {
                    SafariLinkView(url: url)
                } else {
                    ContentUnavailableView("Playback unavailable", systemImage: "exclamationmark.triangle")
                }
            }
            .navigationTitle(tutorial.channelTitle)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct EmbeddedWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.scrollView.isScrollEnabled = true
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if uiView.url != url {
            uiView.load(URLRequest(url: url))
        }
    }
}

private struct SafariLinkView: View {
    let url: URL

    var body: some View {
        VStack(spacing: 16) {
            Text("This video cannot be embedded.")
                .font(.headline)
            Link("Open on YouTube", destination: url)
                .buttonStyle(.borderedProminent)
        }
    }
}
