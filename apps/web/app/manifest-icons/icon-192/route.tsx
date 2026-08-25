import { ImageResponse } from "next/og";

export const runtime = "edge";

/** A dedicated 192x192 PNG for the PWA manifest — icon.tsx's 32x32 is a browser favicon, too
 * small for install-prompt/home-screen icon requirements (Chrome/Android wants 192 and 512). */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#465fff",
          color: "white",
          fontSize: 120,
          fontWeight: 700,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        C
      </div>
    ),
    { width: 192, height: 192 },
  );
}
