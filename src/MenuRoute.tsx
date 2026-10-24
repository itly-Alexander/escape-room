import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { listBundledLevels } from "@/engine/levelStorage";
import { ambientMusic } from "@/engine/ambient";
import { MenuScene } from "@/menu/MenuScene";

export function MenuRoute() {
  const levels = listBundledLevels();
  const [audioStarted, setAudioStarted] = useState(false);

  useEffect(() => {
    return () => {
      ambientMusic.stop();
    };
  }, []);

  const startAudio = () => {
    if (audioStarted) return;
    ambientMusic.start("menu");
    setAudioStarted(true);
  };

  return (
    <div style={pageStyle} onClick={startAudio}>
      <div style={canvasHostStyle}>
        <Canvas
          shadows
          camera={{ position: [0, 1.6, 4], fov: 55 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
          }}
        >
          <MenuScene />
        </Canvas>
      </div>

      <div style={vignetteStyle} />

      <div style={contentStyle}>
        <h1 style={titleStyle}>Can you escape?</h1>
        <div style={subtitleStyle}>
          — a chamber of locks and quiet secrets —
        </div>

        <div style={scrollStyle}>
          <div style={scrollLabelStyle}>Chambers</div>
          {levels.length === 0 && (
            <div style={{ opacity: 0.6 }}>No chambers yet await you.</div>
          )}
          <ul style={listStyle}>
            {levels.map((l) => (
              <li key={l.id} style={itemStyle}>
                <span style={itemNameStyle}>{l.name}</span>
                <span style={coomingSoonStyle}>
                  {l.id == "level-secret" && "Coming Soon"}
                </span>
                <Link
                  style={{
                    ...linkBtn,
                    pointerEvents: l.id == "level-secret" ? "none" : "inherit",
                  }}
                  to={`/play/${l.id}`}
                  onClick={startAudio}
                >
                  Enter
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {!audioStarted && <div style={hintStyle}>click anywhere to begin</div>}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  overflow: "hidden",
  background: "#07050a",
  color: "#e8dcc0",
  fontFamily: '"IM Fell English", "Cinzel", serif',
};
const canvasHostStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
};
const vignetteStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background:
    "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)",
};
const contentStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  paddingTop: "7vh",
  pointerEvents: "none",
};
const titleStyle: React.CSSProperties = {
  fontFamily: '"Cinzel Decorative", serif',
  fontWeight: 900,
  fontSize: "clamp(42px, 7vw, 88px)",
  margin: 0,
  letterSpacing: 4,
  color: "#f3d9a5",
  textShadow:
    "0 0 20px rgba(255, 150, 60, 0.4), 0 0 2px rgba(0,0,0,0.9), 0 4px 12px rgba(0,0,0,0.9)",
};
const subtitleStyle: React.CSSProperties = {
  marginTop: 8,
  fontStyle: "italic",
  fontSize: 18,
  opacity: 0.7,
  color: "#d9c08a",
  textShadow: "0 2px 6px rgba(0,0,0,0.9)",
  letterSpacing: 1,
};
const scrollStyle: React.CSSProperties = {
  marginTop: 48,
  pointerEvents: "auto",
  minWidth: 420,
  maxWidth: 520,
  padding: "28px 36px 32px",
  background:
    "linear-gradient(180deg, rgba(50, 36, 22, 0.78) 0%, rgba(32, 22, 14, 0.78) 100%)",
  border: "1px solid rgba(120, 85, 50, 0.5)",
  borderRadius: 6,
  boxShadow: "0 20px 60px rgba(0,0,0,0.7), inset 0 0 60px rgba(0,0,0,0.4)",
  backdropFilter: "blur(2px)",
};
const scrollLabelStyle: React.CSSProperties = {
  fontFamily: '"Cinzel", serif',
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 4,
  color: "#c9a76a",
  opacity: 0.85,
  marginBottom: 12,
  textAlign: "center",
};
const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  background: "rgba(20, 14, 8, 0.5)",
  border: "1px solid rgba(120, 85, 50, 0.3)",
  borderRadius: 4,
};
const itemNameStyle: React.CSSProperties = {
  flex: 1,
  fontFamily: '"Cinzel", serif',
  fontSize: 16,
  color: "#ead6a8",
  letterSpacing: 1,
};
const coomingSoonStyle: React.CSSProperties = {
  flex: 1,
  fontFamily: '"Cinzel", serif',
  fontSize: 16,
  color: "red",
  letterSpacing: 1,
};
const linkBtn: React.CSSProperties = {
  background: "linear-gradient(180deg, #5a3a1e 0%, #3a2410 100%)",
  color: "#f3d9a5",
  border: "1px solid #8a5e30",
  padding: "6px 16px",
  borderRadius: 3,
  textDecoration: "none",
  fontFamily: '"Cinzel", serif',
  fontSize: 13,
  letterSpacing: 2,
  textTransform: "uppercase",
};
const hintStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 32,
  left: 0,
  right: 0,
  textAlign: "center",
  fontStyle: "italic",
  fontSize: 13,
  opacity: 0.5,
  color: "#c9a76a",
  letterSpacing: 2,
  animation: "none",
};
