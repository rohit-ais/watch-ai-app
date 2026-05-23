"use client";

export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 16px 24px",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: "360px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "40px" }}>
          <p style={{
            fontSize: "10px",
            color: "#333",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: "0 0 5px",
          }}>
            Decision Engine
          </p>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: "30px",
            color: "#fff",
            margin: "0 0 8px",
            lineHeight: 1.2,
          }}>
            What do you want<br />to decide<span style={{ color: "#e53935" }}>?</span>
          </h1>
          <p style={{ fontSize: "13px", color: "#444", margin: 0 }}>
            One question. One answer. No debate.
          </p>
        </div>

        {/* ── Domain Cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Watch Card */}
          <button
            onClick={() => window.location.href = "/watch"}
            style={{
              width: "100%",
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: "16px",
              padding: "20px 18px",
              cursor: "pointer",
              textAlign: "left",
              position: "relative",
              overflow: "hidden",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#e53935"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#1e1e1e"}
          >
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: "1px",
              background: "linear-gradient(90deg,transparent,#e53935,transparent)",
            }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{
                  width: "44px", height: "44px",
                  background: "#1a0a0a",
                  borderRadius: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="14" rx="2" stroke="#e53935" strokeWidth="1.5"/>
                    <path d="M10 9l5 3-5 3V9z" fill="#e53935"/>
                    <path d="M8 20h8M12 18v2" stroke="#e53935" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p style={{
                    fontSize: "16px", fontWeight: 500, color: "#fff",
                    margin: "0 0 3px",
                    fontFamily: "'DM Serif Display', serif",
                  }}>
                    What to Watch
                  </p>
                  <p style={{ fontSize: "11px", color: "#444", margin: 0 }}>
                    Movies + Series • Solo or Group
                  </p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M5 3l4 4-4 4" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </button>

          {/* Do Card */}
          <button
            onClick={() => window.location.href = "/plans"}
            style={{
              width: "100%",
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: "16px",
              padding: "20px 18px",
              cursor: "pointer",
              textAlign: "left",
              position: "relative",
              overflow: "hidden",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#e53935"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#1e1e1e"}
          >
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: "1px",
              background: "linear-gradient(90deg,transparent,#e53935,transparent)",
            }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{
                  width: "44px", height: "44px",
                  background: "#1a0a0a",
                  borderRadius: "12px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2z" stroke="#e53935" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p style={{
                    fontSize: "16px", fontWeight: 500, color: "#fff",
                    margin: "0 0 3px",
                    fontFamily: "'DM Serif Display', serif",
                  }}>
                    What to Do
                  </p>
                  <p style={{ fontSize: "11px", color: "#444", margin: 0 }}>
                    Activities + Plans • Solo
                  </p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M5 3l4 4-4 4" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </button>

        </div>

        {/* ── Footer ── */}
        <p style={{
          fontSize: "10px", color: "#222",
          textAlign: "center",
          marginTop: "40px",
        }}>
          More domains coming soon
        </p>

      </div>
    </main>
  );
}