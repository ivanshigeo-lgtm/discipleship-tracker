import type { Viewport } from "next";

// These routes render inside the WikiChurch app's WebView. Without
// maximum-scale, iOS auto-zooms the page when a small-font input (e.g. the
// My SOAPs search box) gains focus, and the zoom sticks after the keyboard
// closes, clipping the right edge. Scoped to /my-journey/embed/* only so
// regular web keeps pinch-zoom semantics untouched.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function EmbedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
