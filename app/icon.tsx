import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// This file takes precedence over favicon.ico and icon.svg in Next.js App Router.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#002651",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Outer V */}
        <svg
          viewBox="0 0 32 32"
          width={30}
          height={30}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 4 L16 25 L29 4"
            fill="none"
            stroke="white"
            strokeWidth="3.2"
            strokeLinejoin="round"
            strokeLinecap="butt"
          />
          <path
            d="M9 4 L16 18 L23 4"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="butt"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
