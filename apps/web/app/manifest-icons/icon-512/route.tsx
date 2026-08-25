import { ImageResponse } from "next/og";

export const runtime = "edge";

/** 512x512 PNG for the PWA manifest — see icon-192/route.tsx for why this exists alongside icon.tsx. */
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
          fontSize: 320,
          fontWeight: 700,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        C
      </div>
    ),
    { width: 512, height: 512 },
  );
}
