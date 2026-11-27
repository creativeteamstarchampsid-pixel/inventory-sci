import * as React from "react";

import { cn } from "@/lib/utils";

export type KawaiiMascotType =
  | "dino"
  | "chiikawa"
  | "cat"
  | "star"
  | "box"
  | "truck"
  | "vault"
  | "folder"
  | "barcode"
  | "book"
  | "history"
  | "trash"
  | "gear"
  | "scan"
  | "clipboard"
  | "backup"
  | "room";

const INK = "#2C2623";
const BLUSH = "#FDA4AF";

function svgMotionStyle(
  transformOrigin = "center",
  animationDelay?: string,
): React.CSSProperties {
  return animationDelay
    ? { transformBox: "fill-box", transformOrigin, animationDelay }
    : { transformBox: "fill-box", transformOrigin };
}

function breatheGroupProps(
  compact: boolean,
  transformOrigin: string,
  animationDelay: string,
) {
  return compact
    ? {}
    : {
        className: "animate-kawaii-breathe",
        style: svgMotionStyle(transformOrigin, animationDelay),
      };
}

export function KawaiiMascotSvg({
  type,
  className,
  compact = false,
}: {
  type: KawaiiMascotType;
  className?: string;
  compact?: boolean;
}) {
  const baseClass = cn("size-10 shrink-0 select-none", className);

  switch (type) {
    case "dino":
      // Joguman-inspired adorable chubby mint green dino
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-0.2s")}>
            {/* Wagging chubby tail behind hip */}
            <g
              className={compact ? undefined : "animate-kawaii-tail"}
              style={compact ? undefined : svgMotionStyle("88% 58%", "-0.4s")}
            >
              <path
                d="M21 49.5c-6.2 0-10-3-10-6.8 0-2.6 2.5-3.7 5.5-3.7h4.5Z"
                fill="#6EE7B7"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
            {/* Little dorsal spikes */}
            <path
              d="M21 15c-3 0-4 3-2 5M16 24c-3.5 0-4.5 3.5-2 5.5M14 34c-3.5.5-4 4-1.5 5.5"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="#FDE68A"
            />
            {/* Chubby dino body + snout */}
            <path
              d="M20 52c-2.6-1.5-4.3-6.5-4-13-.5-11 2-24 14-25 10-.8 19 3.5 20.5 11.5 1 5-2 9.5-7 10.8 1.5 3.8 1.5 8.5-.5 12.2-1.5 2.8-5 3.5-8.5 3.5h-4v3.5c0 2-1.8 3.5-4 3.5s-4-1.5-4-3.5V52h-2.5Z"
              fill="#6EE7B7"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Second little foot */}
            <path
              d="M36 52v3.5c0 2 1.8 3.5 4 3.5s4-1.5 4-3.5v-4.5"
              fill="#6EE7B7"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Butter cream tummy */}
            <path
              d="M33 38c4.2 0 7.5 3.5 7.5 8 0 3.2-1.8 5.2-4.8 5.5-4 .4-7.2-1.5-7.2-5.5 0-4.5 1.8-8 4.5-8Z"
              fill="#FEF3C7"
            />
            {/* Cute tiny waving arm */}
            <g className="animate-wave-2d" style={svgMotionStyle("12% 65%", "-0.3s")}>
              <path
                d="M41 37c4.5-1.5 7.5-3.5 8.5-2 1 1.5-1.5 5.2-6 6"
                fill="#6EE7B7"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
            {/* Blinking eyes & sparkle */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-0.3s")}>
              <circle cx="31" cy="24.5" r="2.3" fill={INK} />
              <circle cx="42.5" cy="24.5" r="2.3" fill={INK} />
              <circle cx="30.3" cy="23.7" r="0.8" fill="#FFFDF7" />
              <circle cx="41.8" cy="23.7" r="0.8" fill="#FFFDF7" />
            </g>
            {/* Rosy cheeks */}
            <ellipse cx="26.8" cy="28.2" rx="3" ry="1.8" fill={BLUSH} />
            <ellipse cx="46.2" cy="28.2" rx="3" ry="1.8" fill={BLUSH} />
            {/* Tiny sweet smile */}
            <path
              d="M34.5 28.5c1.2 1.6 3.5 1.6 4.7 0"
              stroke={INK}
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </g>
          {/* Floating cheerful music note accent */}
          {!compact && (
            <g className="animate-kawaii-note" style={svgMotionStyle("center", "-0.6s")}>
              <path
                d="M55.5 18.5v-6.8c2.2.3 3.8 1.5 4.2 3.3"
                stroke={INK}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="53.8" cy="18.8" r="1.8" fill="#FDE68A" stroke={INK} strokeWidth="1.5" />
            </g>
          )}
        </svg>
      );

    case "chiikawa":
      // Puffy snowy-white Chiikawa-style buddy
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-0.9s")}>
            {/* Round fluffy twitching ears */}
            <g className="animate-kawaii-ear" style={svgMotionStyle("72% 82%", "-0.2s")}>
              <circle cx="19" cy="17" r="7" fill="#FFFDF7" stroke={INK} strokeWidth="2.5" />
              <circle cx="19" cy="17" r="3.4" fill="#FFE4E8" />
            </g>
            <g className="animate-kawaii-ear" style={svgMotionStyle("28% 82%", "-2.0s")}>
              <circle cx="45" cy="17" r="7" fill="#FFFDF7" stroke={INK} strokeWidth="2.5" />
              <circle cx="45" cy="17" r="3.4" fill="#FFE4E8" />
            </g>
            {/* Plump pear/marshmallow body */}
            <path
              d="M14 35c0-11 7.5-19 18-19s18 8 18 19c0 11.5-5.5 20-18 20s-18-8.5-18-20Z"
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Tiny joyful waving paws */}
            <g
              className={compact ? undefined : "animate-wave-2d"}
              style={compact ? undefined : svgMotionStyle("90% 45%", "-0.1s")}
            >
              <path
                d="M15 38c-4.5-1-6.5 2-5 4.8 1.2 2.2 4.5 1.8 6.5.5"
                fill="#FFFDF7"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>
            <g
              className={compact ? undefined : "animate-wave-2d"}
              style={compact ? undefined : svgMotionStyle("10% 45%", "-1.2s")}
            >
              <path
                d="M49 38c4.5-1 6.5 2 5 4.8-1.2 2.2-4.5 1.8-6.5.5"
                fill="#FFFDF7"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>
            {/* Little stubby feet */}
            <ellipse cx="24.5" cy="54.5" rx="4.2" ry="3" fill="#FFFDF7" stroke={INK} strokeWidth="2.5" />
            <ellipse cx="39.5" cy="54.5" rx="4.2" ry="3" fill="#FFFDF7" stroke={INK} strokeWidth="2.5" />
            {/* Expressive blinking dot eyes */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-1.5s")}>
              <circle cx="25" cy="31" r="2.6" fill={INK} />
              <circle cx="39" cy="31" r="2.6" fill={INK} />
              <circle cx="24.2" cy="30" r="1" fill="#FFFDF7" />
              <circle cx="38.2" cy="30" r="1" fill="#FFFDF7" />
            </g>
            {/* Rosy cheeks */}
            <ellipse cx="20.5" cy="35.5" rx="3.4" ry="2.1" fill={BLUSH} />
            <ellipse cx="43.5" cy="35.5" rx="3.4" ry="2.1" fill={BLUSH} />
            {/* Cute tiny ω mouth */}
            <path
              d="M28.8 35.5c.8 1.6 2.5 1.6 3.2 0 .7 1.6 2.4 1.6 3.2 0"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* Floating tiny blush heart */}
          {!compact && (
            <g className="animate-kawaii-note" style={svgMotionStyle("center", "-1.4s")}>
              <path
                d="M55 18.8c-2.2-1.6-3.6-2.9-3.6-4.3 0-1.1.8-1.9 1.8-1.9.8 0 1.4.4 1.8 1.1.4-.7 1-1.1 1.8-1.1 1 0 1.8.8 1.8 1.9 0 1.4-1.4 2.7-3.6 4.3Z"
                fill={BLUSH}
                stroke={INK}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      );

    case "cat":
      // Hachiware-inspired sky-blue-eared kitty buddy
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-1.6s")}>
            {/* Happy wagging sky-blue kitty tail */}
            <g
              className={compact ? undefined : "animate-kawaii-tail"}
              style={compact ? undefined : svgMotionStyle("12% 82%", "-0.5s")}
            >
              <path
                d="M47 49c5.2.2 10-1.4 10.8-5.1"
                stroke={INK}
                strokeWidth="7.2"
                strokeLinecap="round"
              />
              <path
                d="M47 49c5.2.2 10-1.4 10.8-5.1"
                stroke="#7CC4FA"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
            {/* Pointed twitching ears */}
            <g className="animate-kawaii-ear" style={svgMotionStyle("65% 88%", "-0.7s")}>
              <path
                d="M15 28 14 11l14 9"
                fill="#7CC4FA"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
            <g className="animate-kawaii-ear" style={svgMotionStyle("35% 88%", "-2.5s")}>
              <path
                d="M49 28l1-17-14 9"
                fill="#7CC4FA"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
            {/* Round kitty head & body */}
            <path
              d="M13 36c0-11 8-19 19-19s19 8 19 19c0 11-7 19-19 19s-19-8-19-19Z"
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Hachiware parted blue bangs */}
            <path
              d="M14.5 29c4-6.5 10.5-11 17.5-11.5-3.5 5-8 8.5-17.5 11.5ZM49.5 29c-4-6.5-10.5-11-17.5-11.5 3.5 5 8 8.5 17.5 11.5Z"
              fill="#7CC4FA"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            {/* Blinking eyes */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-2.4s")}>
              <circle cx="24.5" cy="34.5" r="2.5" fill={INK} />
              <circle cx="39.5" cy="34.5" r="2.5" fill={INK} />
              <circle cx="23.8" cy="33.7" r="0.9" fill="#FFFDF7" />
              <circle cx="38.8" cy="33.7" r="0.9" fill="#FFFDF7" />
            </g>
            {/* Rosy cheeks */}
            <ellipse cx="20" cy="39" rx="3.2" ry="1.9" fill={BLUSH} />
            <ellipse cx="44" cy="39" rx="3.2" ry="1.9" fill={BLUSH} />
            {/* Cat mouth */}
            <path
              d="M28.5 39c1 1.7 2.5 1.7 3.5 0 1 1.7 2.5 1.7 3.5 0"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Cute whiskers */}
            <path
              d="M10 36h4M10.5 40.5l3.5-.5M54 36h-4M53.5 40.5l-3.5-.5"
              stroke={INK}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        </svg>
      );

    case "star":
      // Plump rounded butter-yellow Bintang StarChamps mascot
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "center", "-0.5s")}>
            <path
              d="M32 7.5c1.8 0 3.3 1 4.1 2.6l4.9 9.8 10.8 1.6c3.5.5 4.9 4.8 2.4 7.3l-7.8 7.6 1.8 10.8c.6 3.5-3.1 6.2-6.2 4.5L32 46.6l-10 5.1c-3.1 1.7-6.8-1-6.2-4.5l1.8-10.8-7.8-7.6c-2.5-2.5-1.1-6.8 2.4-7.3l10.8-1.6 4.9-9.8c.8-1.6 2.3-2.6 4.1-2.6Z"
              fill="#FDE68A"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Cute blinking face */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-0.9s")}>
              <circle cx="26" cy="31" r="2.4" fill={INK} />
              <circle cx="38" cy="31" r="2.4" fill={INK} />
              <circle cx="25.3" cy="30.2" r="0.8" fill="#FFFDF7" />
              <circle cx="37.3" cy="30.2" r="0.8" fill="#FFFDF7" />
            </g>
            <ellipse cx="21.8" cy="35" rx="3" ry="1.8" fill={BLUSH} />
            <ellipse cx="42.2" cy="35" rx="3" ry="1.8" fill={BLUSH} />
            <path
              d="M28.5 35.5c1.5 2.2 5.5 2.2 7 0"
              stroke={INK}
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </g>
          {/* Twinkling mini sparkle dots */}
          <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-0.2s")}>
            <circle cx="11" cy="14" r="2.2" fill="#FDA4AF" stroke={INK} strokeWidth="1.6" />
          </g>
          <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-1.5s")}>
            <circle cx="54" cy="15" r="2" fill="#7CC4FA" stroke={INK} strokeWidth="1.6" />
          </g>
          {!compact && (
            <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-0.9s")}>
              <path
                d="M10 48.5 11.2 51.3 14 52.5 11.2 53.7 10 56.5 8.8 53.7 6 52.5 8.8 51.3Z"
                fill="#6EE7B7"
                stroke={INK}
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      );

    case "box":
      // Cute smiling warm kraft cardboard toy box
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-1.2s")}>
            {/* Open wagging flaps */}
            <g
              className={compact ? "animate-kawaii-ear" : "animate-kawaii-tail"}
              style={svgMotionStyle("62% 96%", "-0.3s")}
            >
              <path
                d="M12 24 6 15l17-4 9 13"
                fill="#FCE3BA"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            </g>
            <g
              className={compact ? "animate-kawaii-ear" : "animate-kawaii-tail"}
              style={svgMotionStyle("38% 96%", "-1.5s")}
            >
              <path
                d="M52 24l6-9-17-4-9 13"
                fill="#FCE3BA"
                stroke={INK}
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            </g>
            {/* Main box body */}
            <rect
              x="12"
              y="22"
              width="40"
              height="33"
              rx="8"
              fill="#F3D19C"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Cute pastel tape strip */}
            <rect
              x="27"
              y="22"
              width="10"
              height="10"
              rx="2"
              fill="#A7F3D0"
              stroke={INK}
              strokeWidth="2"
            />
            {/* Cute blinking face */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-1.8s")}>
              <circle cx="24" cy="39" r="2.3" fill={INK} />
              <circle cx="40" cy="39" r="2.3" fill={INK} />
              <circle cx="23.3" cy="38.2" r="0.7" fill="#FFFDF7" />
              <circle cx="39.3" cy="38.2" r="0.7" fill="#FFFDF7" />
            </g>
            <ellipse cx="19.5" cy="43" rx="2.8" ry="1.7" fill={BLUSH} />
            <ellipse cx="44.5" cy="43" rx="2.8" ry="1.7" fill={BLUSH} />
            <path
              d="M29 43.2c1.4 1.8 4.6 1.8 6 0"
              stroke={INK}
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </g>
          {/* Floating mint sparkle peeking above the open box */}
          {!compact && (
            <g className="animate-kawaii-note" style={svgMotionStyle("center", "-1.0s")}>
              <path
                d="M32 9.5 33.1 12.2 35.8 13.3 33.1 14.4 32 17.1 30.9 14.4 28.2 13.3 30.9 12.2Z"
                fill="#A7F3D0"
                stroke={INK}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      );

    case "truck":
      // Happy pastel delivery truck
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          {/* Floating cute travel puff cloud */}
          {!compact && (
            <g className="animate-kawaii-note" style={svgMotionStyle("center", "-0.8s")}>
              <path
                d="M47.5 17.5h7.2a2.5 2.5 0 0 0 .3-5 3.3 3.3 0 0 0-6.2-.5 2.3 2.3 0 0 0-1.3 5.5Z"
                fill="#FFFDF7"
                stroke={INK}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </g>
          )}
          {/* Cozy breathing cargo & cab */}
          <g {...breatheGroupProps(compact, "bottom center", "-0.4s")}>
            {/* Cargo box */}
            <rect
              x="7"
              y="18"
              width="32"
              height="28"
              rx="7"
              fill="#FED7AA"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Mint stripe on cargo */}
            <path d="M9 28h28" stroke="#2AB673" strokeWidth="4" strokeLinecap="round" />
            {/* Rounded cab */}
            <path
              d="M39 24h9.5c3.5 0 6.5 2.5 7.5 6l2 7c.8 3-1 9-4.5 9H39V24Z"
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Cab window */}
            <path
              d="M42.5 28h5.5c2 0 3.6 1.4 4.2 3.4l.8 2.6H42.5v-6Z"
              fill="#BAE6FD"
              stroke={INK}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Cute blinking face on cargo */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-2.9s")}>
              <circle cx="18.5" cy="36" r="2.1" fill={INK} />
              <circle cx="28.5" cy="36" r="2.1" fill={INK} />
              <circle cx="17.9" cy="35.3" r="0.65" fill="#FFFDF7" />
              <circle cx="27.9" cy="35.3" r="0.65" fill="#FFFDF7" />
            </g>
            <ellipse cx="15" cy="39.3" rx="2.4" ry="1.4" fill={BLUSH} />
            <ellipse cx="32" cy="39.3" rx="2.4" ry="1.4" fill={BLUSH} />
            <path d="M21.5 39.2c1.1 1.4 2.9 1.4 4 0" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* Smoothly rolling chubby wheels */}
          <g className="animate-kawaii-spin-slow" style={svgMotionStyle("center")}>
            <circle cx="19" cy="48" r="6" fill="#4B423D" stroke={INK} strokeWidth="2.5" />
            <circle cx="19" cy="48" r="2.4" fill="#FDE68A" />
            <path
              d="M19 46.3v3.4M17.3 48h3.4"
              stroke="#B45309"
              strokeWidth="1.15"
              strokeLinecap="round"
            />
            <circle cx="19" cy="44" r="0.7" fill="#FFFDF7" opacity="0.7" />
          </g>
          <g className="animate-kawaii-spin-slow" style={svgMotionStyle("center")}>
            <circle cx="47" cy="48" r="6" fill="#4B423D" stroke={INK} strokeWidth="2.5" />
            <circle cx="47" cy="48" r="2.4" fill="#FDE68A" />
            <path
              d="M47 46.3v3.4M45.3 48h3.4"
              stroke="#B45309"
              strokeWidth="1.15"
              strokeLinecap="round"
            />
            <circle cx="47" cy="44" r="0.7" fill="#FFFDF7" opacity="0.7" />
          </g>
        </svg>
      );

    case "vault":
      // Cute bear-eared pastel padlock vault
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-1.8s")}>
            {/* Padlock shackle */}
            <path
              d="M21 28v-8c0-6.1 4.9-11 11-11s11 4.9 11 11v8"
              stroke={INK}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M21 28v-8c0-6.1 4.9-11 11-11s11 4.9 11 11v8"
              stroke="#FDE68A"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Cute twitching bear ears on vault corners */}
            <g className="animate-kawaii-ear" style={svgMotionStyle("75% 75%", "-0.6s")}>
              <circle cx="17" cy="28" r="5" fill="#7CC4FA" stroke={INK} strokeWidth="2.5" />
            </g>
            <g className="animate-kawaii-ear" style={svgMotionStyle("25% 75%", "-2.4s")}>
              <circle cx="47" cy="28" r="5" fill="#7CC4FA" stroke={INK} strokeWidth="2.5" />
            </g>
            {/* Vault body */}
            <rect
              x="13"
              y="26"
              width="38"
              height="30"
              rx="11"
              fill="#BAE6FD"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Cute cream muzzle & twinkling golden keyhole nose */}
            <ellipse cx="32" cy="44.5" rx="7.5" ry="5.5" fill="#FFFDF7" />
            <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-0.4s")}>
              <circle cx="32" cy="43" r="2.4" fill="#FDE68A" stroke={INK} strokeWidth="1.8" />
              <circle cx="31.3" cy="42.3" r="0.65" fill="#FFFDF7" />
            </g>
            <path d="M32 45.4v2.6" stroke={INK} strokeWidth="2" strokeLinecap="round" />
            {/* Blinking dot eyes & rosy cheeks */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-3.2s")}>
              <circle cx="23.5" cy="37" r="2.2" fill={INK} />
              <circle cx="40.5" cy="37" r="2.2" fill={INK} />
              <circle cx="22.8" cy="36.3" r="0.7" fill="#FFFDF7" />
              <circle cx="39.8" cy="36.3" r="0.7" fill="#FFFDF7" />
            </g>
            <ellipse cx="19.5" cy="41.2" rx="2.7" ry="1.6" fill={BLUSH} />
            <ellipse cx="44.5" cy="41.2" rx="2.7" ry="1.6" fill={BLUSH} />
          </g>
          {/* Twinkling key glint star */}
          {!compact && (
            <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-1.3s")}>
              <path
                d="M53 11 54.2 13.8 57 15 54.2 16.2 53 19 51.8 16.2 49 15 51.8 13.8Z"
                fill="#FDE68A"
                stroke={INK}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      );

    case "folder":
      // Cute smiling mint archive folder with colorful tabs
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-2.1s")}>
            {/* Peeking wiggling document tabs */}
            <g className="animate-kawaii-ear" style={svgMotionStyle("30% 100%", "-0.5s")}>
              <rect x="24" y="13" width="26" height="14" rx="4" fill="#FDE68A" stroke={INK} strokeWidth="2.3" />
            </g>
            <g className="animate-kawaii-ear" style={svgMotionStyle("70% 100%", "-2.2s")}>
              <rect x="32" y="16" width="20" height="12" rx="4" fill="#FFE4EA" stroke={INK} strokeWidth="2.3" />
            </g>
            {/* Main folder body */}
            <path
              d="M9 21c0-3.3 2.7-6 6-6h11.5c1.8 0 3.5.8 4.6 2.2l2.4 2.8H49c3.3 0 6 2.7 6 6v21c0 4.4-3.6 8-8 8H17c-4.4 0-8-3.6-8-8V21Z"
              fill="#99F6E4"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Cute blinking face */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-0.7s")}>
              <circle cx="24.5" cy="37" r="2.3" fill={INK} />
              <circle cx="39.5" cy="37" r="2.3" fill={INK} />
              <circle cx="23.8" cy="36.2" r="0.7" fill="#FFFDF7" />
              <circle cx="38.8" cy="36.2" r="0.7" fill="#FFFDF7" />
            </g>
            <ellipse cx="19.8" cy="41" rx="2.8" ry="1.7" fill={BLUSH} />
            <ellipse cx="44.2" cy="41" rx="2.8" ry="1.7" fill={BLUSH} />
            <path d="M29 41.2c1.4 1.8 4.6 1.8 6 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </svg>
      );

    case "barcode":
      // Adorable pastel pink & cream barcode sticker tag
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-1.0s")}>
            {/* Outer rounded sticker */}
            <rect
              x="9"
              y="13"
              width="46"
              height="38"
              rx="10"
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Pastel pink header strip */}
            <path
              d="M9 23c0-5.5 4.5-10 10-10h26c5.5 0 10 4.5 10 10v5H9v-5Z"
              fill="#FBCFE8"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Tiny smiling blinking face in pink header */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-2.1s")}>
              <circle cx="26" cy="20.5" r="1.8" fill={INK} />
              <circle cx="38" cy="20.5" r="1.8" fill={INK} />
            </g>
            <ellipse cx="22.2" cy="22.5" rx="2.1" ry="1.2" fill="#FB7185" opacity="0.7" />
            <ellipse cx="41.8" cy="22.5" rx="2.1" ry="1.2" fill="#FB7185" opacity="0.7" />
            <path d="M30 22c1 1.2 3 1.2 4 0" stroke={INK} strokeWidth="1.9" strokeLinecap="round" />
            {/* Thick rounded 2D barcode bars */}
            <g fill={INK}>
              <rect x="16" y="33" width="3.5" height="12" rx="1.5" />
              <rect x="22" y="33" width="2" height="12" rx="1" />
              <rect x="26.5" y="33" width="4.5" height="12" rx="1.5" />
              <rect x="33.5" y="33" width="2.2" height="12" rx="1" />
              <rect x="38" y="33" width="4" height="12" rx="1.5" />
              <rect x="44.5" y="33" width="3.5" height="12" rx="1.5" />
            </g>
            {/* Smooth mint laser sweep across barcode bars */}
            <g transform="translate(0 33) scale(1 0.38)">
              <g className="animate-scan-2d" style={svgMotionStyle("center", "-0.7s")}>
                <rect x="13.5" y="0" width="37" height="5.6" rx="1.2" ry="2.8" fill="#2AB673" opacity="0.78" />
              </g>
            </g>
          </g>
          {/* Twinkling cute corner star */}
          <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-0.8s")}>
            <circle cx="54" cy="13" r="4" fill="#FDE68A" stroke={INK} strokeWidth="2" />
            <circle cx="52.8" cy="11.8" r="0.9" fill="#FFFDF7" />
          </g>
        </svg>
      );

    case "book":
      // Cozy butter-yellow smiling guidebook with pink bookmark
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-0.7s")}>
            {/* Book cover */}
            <rect
              x="13"
              y="12"
              width="38"
              height="42"
              rx="8"
              fill="#FDE68A"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Book spine */}
            <path
              d="M21 12v42"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* White label patch */}
            <rect
              x="25"
              y="22"
              width="21"
              height="22"
              rx="6"
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth="2"
            />
            {/* Cute blinking face */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-1.3s")}>
              <circle cx="31.5" cy="31.5" r="2" fill={INK} />
              <circle cx="39.5" cy="31.5" r="2" fill={INK} />
              <circle cx="30.9" cy="30.8" r="0.65" fill="#FFFDF7" />
              <circle cx="38.9" cy="30.8" r="0.65" fill="#FFFDF7" />
            </g>
            <ellipse cx="28.8" cy="35" rx="2.2" ry="1.3" fill={BLUSH} />
            <ellipse cx="42.2" cy="35" rx="2.2" ry="1.3" fill={BLUSH} />
            <path d="M33.5 35.2c1 1.4 3 1.4 4 0" stroke={INK} strokeWidth="2" strokeLinecap="round" />
            {/* Swaying pink ribbon bookmark draped over top cover */}
            <g className="animate-kawaii-tail" style={svgMotionStyle("50% 15%", "-0.3s")}>
              <path
                d="M41 9h7v11.5l-3.5-2.6L41 20.5V9Z"
                fill="#FDA4AF"
                stroke={INK}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            </g>
          </g>
          {/* Twinkling guidebook sparkle */}
          {!compact && (
            <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-1.1s")}>
              <path
                d="M7.5 13 8.6 15.8 11.4 17 8.6 18.2 7.5 21 6.4 18.2 3.6 17 6.4 15.8Z"
                fill="#7CC4FA"
                stroke={INK}
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      );

    case "history":
      // Cute lavender alarm-clock buddy
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-2.5s")}>
            {/* Cute twitching clock ears/bells */}
            <g className="animate-kawaii-ear" style={svgMotionStyle("75% 80%", "-0.4s")}>
              <circle cx="17" cy="17" r="6.5" fill="#FDE68A" stroke={INK} strokeWidth="2.5" />
            </g>
            <g className="animate-kawaii-ear" style={svgMotionStyle("25% 80%", "-2.2s")}>
              <circle cx="47" cy="17" r="6.5" fill="#FDE68A" stroke={INK} strokeWidth="2.5" />
            </g>
            {/* Little feet */}
            <path d="M20 51 17 56M44 51l3 5" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
            {/* Round lavender body */}
            <circle cx="32" cy="34" r="20" fill="#DDD6FE" stroke={INK} strokeWidth="2.5" />
            <circle cx="32" cy="34" r="14.5" fill="#FFFDF7" stroke={INK} strokeWidth="2" />
            {/* Smoothly rotating minute hand + static hour hand */}
            <g className="animate-kawaii-spin-slow" style={svgMotionStyle("center")}>
              <circle cx="32" cy="32.5" r="7.5" fill="transparent" />
              <path d="M32 32.5V25" stroke="#2AB673" strokeWidth="2.5" strokeLinecap="round" />
            </g>
            <path d="M32 32.5l4.6 2.6" stroke="#2AB673" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="32" cy="32.5" r="1.4" fill={INK} />
            {/* Cute blinking eyes & cheeks at bottom */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-3.6s")}>
              <circle cx="25.5" cy="37.5" r="1.9" fill={INK} />
              <circle cx="38.5" cy="37.5" r="1.9" fill={INK} />
            </g>
            <ellipse cx="22.5" cy="40.5" rx="2.3" ry="1.3" fill={BLUSH} />
            <ellipse cx="41.5" cy="40.5" rx="2.3" ry="1.3" fill={BLUSH} />
            <path d="M29.8 41c1 1.3 3.4 1.3 4.4 0" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      );

    case "trash":
      // Friendly pastel pink/mint tidy recycle bin buddy
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-1.4s")}>
            {/* Playful slightly-tilted wiggling lid */}
            <g transform="rotate(-6 32 18)">
              <g className="animate-kawaii-ear" style={svgMotionStyle("18% 88%", "-0.8s")}>
                <rect x="25" y="10" width="14" height="5" rx="2.5" fill="#A7F3D0" stroke={INK} strokeWidth="2.3" />
                <rect x="13" y="15" width="38" height="7" rx="3.5" fill="#FDA4AF" stroke={INK} strokeWidth="2.5" />
              </g>
            </g>
            {/* Bin body */}
            <path
              d="M17 24h30l-2.5 27c-.4 3.5-3.3 6-6.8 6H26.3c-3.5 0-6.4-2.5-6.8-6L17 24Z"
              fill="#FFE4EA"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Cute blinking face */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-2.7s")}>
              <circle cx="25.5" cy="37" r="2.2" fill={INK} />
              <circle cx="38.5" cy="37" r="2.2" fill={INK} />
              <circle cx="24.8" cy="36.3" r="0.7" fill="#FFFDF7" />
              <circle cx="37.8" cy="36.3" r="0.7" fill="#FFFDF7" />
            </g>
            <ellipse cx="21.5" cy="41" rx="2.6" ry="1.5" fill={BLUSH} />
            <ellipse cx="42.5" cy="41" rx="2.6" ry="1.5" fill={BLUSH} />
            <path d="M29.2 41.2c1.3 1.7 4.3 1.7 5.6 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          </g>
          {/* Twinkling little mint sparkle */}
          <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-1.6s")}>
            <circle cx="51" cy="30" r="3" fill="#A7F3D0" stroke={INK} strokeWidth="1.8" />
            <circle cx="50.1" cy="29.1" r="0.7" fill="#FFFDF7" />
          </g>
        </svg>
      );

    case "gear":
      // Plump pastel lavender smiling gear buddy
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          {/* Smoothly rotating outer cog teeth */}
          <g className="animate-kawaii-spin-slow" style={svgMotionStyle("center")}>
            <path
              d="M27.5 10h9l1.4 5.3a17 17 0 0 1 4.4 1.8l4.8-2.8 6.3 6.3-2.8 4.8a17 17 0 0 1 1.8 4.4L57.7 31v9l-5.3 1.4a17 17 0 0 1-1.8 4.4l2.8 4.8-6.3 6.3-4.8-2.8a17 17 0 0 1-4.4 1.8L36.5 61h-9l-1.4-5.3a17 17 0 0 1-4.4-1.8l-4.8 2.8-6.3-6.3 2.8-4.8a17 17 0 0 1-1.8-4.4L6.3 40v-9l5.3-1.4a17 17 0 0 1 1.8-4.4l-2.8-4.8 6.3-6.3 4.8 2.8a17 17 0 0 1 4.4-1.8L27.5 10Z"
              fill="#C4B5FD"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </g>
          {/* Upright gently breathing center face */}
          <g {...breatheGroupProps(compact, "center", "-0.6s")}>
            <circle cx="32" cy="35.5" r="13" fill="#FFFDF7" stroke={INK} strokeWidth="2.3" />
            {/* Cute blinking face */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-1.1s")}>
              <circle cx="27" cy="34" r="2.1" fill={INK} />
              <circle cx="37" cy="34" r="2.1" fill={INK} />
              <circle cx="26.4" cy="33.3" r="0.65" fill="#FFFDF7" />
              <circle cx="36.4" cy="33.3" r="0.65" fill="#FFFDF7" />
            </g>
            <ellipse cx="23.8" cy="37.5" rx="2.4" ry="1.4" fill={BLUSH} />
            <ellipse cx="40.2" cy="37.5" rx="2.4" ry="1.4" fill={BLUSH} />
            <path d="M29.5 38c1.2 1.6 3.8 1.6 5 0" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
          </g>
        </svg>
      );

    case "scan":
      // Cute mint viewfinder scanner frame with happy face
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          {/* Soft mint inner card + happy blinking face */}
          <g {...breatheGroupProps(compact, "center", "-1.9s")}>
            <rect
              x="14"
              y="14"
              width="36"
              height="36"
              rx="10"
              fill="#D8F8E7"
              stroke={INK}
              strokeWidth="2.5"
            />
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-0.5s")}>
              <circle cx="25.5" cy="29" r="2.3" fill={INK} />
              <circle cx="38.5" cy="29" r="2.3" fill={INK} />
              <circle cx="24.8" cy="28.2" r="0.7" fill="#FFFDF7" />
              <circle cx="37.8" cy="28.2" r="0.7" fill="#FFFDF7" />
            </g>
            <ellipse cx="21.5" cy="33" rx="2.6" ry="1.6" fill={BLUSH} />
            <ellipse cx="42.5" cy="33" rx="2.6" ry="1.6" fill={BLUSH} />
            <path d="M29 33.2c1.4 1.8 4.6 1.8 6 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          </g>
          {/* Bold corner brackets */}
          <path
            d="M8 21v-6a7 7 0 0 1 7-7h6M43 8h6a7 7 0 0 1 7 7v6M56 43v6a7 7 0 0 1-7 7h-6M21 56h-6a7 7 0 0 1-7-7v-6"
            stroke={INK}
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {/* Smooth sweeping Joguman mint scan laser (y=18 -> y=46) */}
          <g className="animate-scan-2d" style={svgMotionStyle("center")}>
            <path d="M13 18h38" stroke="#6EE7B7" strokeWidth="6" strokeLinecap="round" opacity="0.45" />
            <path d="M12 18h40" stroke="#2AB673" strokeWidth="3.2" strokeLinecap="round" />
          </g>
        </svg>
      );

    case "clipboard":
      // Cheerful pastel rose clipboard with checkmark badge
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          <g {...breatheGroupProps(compact, "bottom center", "-0.8s")}>
            {/* Board */}
            <rect
              x="12"
              y="14"
              width="40"
              height="43"
              rx="9"
              fill="#FECDD3"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Inner paper sheet */}
            <rect
              x="18"
              y="21"
              width="28"
              height="30"
              rx="5"
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth="2"
            />
            {/* Playful wiggling butter top clip */}
            <g className="animate-kawaii-ear" style={svgMotionStyle("50% 85%", "-1.2s")}>
              <rect
                x="23"
                y="9"
                width="18"
                height="10"
                rx="4.5"
                fill="#FDE68A"
                stroke={INK}
                strokeWidth="2.5"
              />
            </g>
            {/* Cute smiling blinking face on paper */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-3.1s")}>
              <circle cx="27" cy="34" r="2" fill={INK} />
              <circle cx="37" cy="34" r="2" fill={INK} />
              <circle cx="26.4" cy="33.3" r="0.65" fill="#FFFDF7" />
              <circle cx="36.4" cy="33.3" r="0.65" fill="#FFFDF7" />
            </g>
            <ellipse cx="23.8" cy="37.2" rx="2.2" ry="1.3" fill={BLUSH} />
            <ellipse cx="40.2" cy="37.2" rx="2.2" ry="1.3" fill={BLUSH} />
            <path d="M29.8 37.5c1.1 1.4 3.3 1.4 4.4 0" stroke={INK} strokeWidth="2" strokeLinecap="round" />
            {/* Happy swaying mint check sticker */}
            <g className="animate-kawaii-tail" style={svgMotionStyle("center", "-0.9s")}>
              <circle cx="48" cy="49" r="7.5" fill="#6EE7B7" stroke={INK} strokeWidth="2.3" />
              <path
                d="M44.5 49l2.4 2.5 4.8-4.8"
                stroke={INK}
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
          {/* Floating butter sparkle */}
          {!compact && (
            <g className="animate-kawaii-note" style={svgMotionStyle("center", "-1.8s")}>
              <path
                d="M55.5 11 56.6 13.6 59.2 14.7 56.6 15.8 55.5 18.4 54.4 15.8 51.8 14.7 54.4 13.6Z"
                fill="#FDE68A"
                stroke={INK}
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      );

    case "backup":
      // Fluffy sky-blue smiling cloud-drive buddy
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          {/* Twinkling cloud sparkles */}
          <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-0.5s")}>
            <path
              d="M10.5 11.5 11.7 14.3 14.5 15.5 11.7 16.7 10.5 19.5 9.3 16.7 6.5 15.5 9.3 14.3Z"
              fill="#FDE68A"
              stroke={INK}
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </g>
          {!compact && (
            <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-1.7s")}>
              <circle cx="54" cy="15.5" r="2.2" fill="#FDA4AF" stroke={INK} strokeWidth="1.5" />
            </g>
          )}
          <g {...breatheGroupProps(compact, "bottom center", "-1.5s")}>
            {/* Fluffy cartoon cloud */}
            <path
              d="M18 46h29c6.6 0 11-4.8 11-10.8 0-5.4-4-9.8-9.3-10.5C47.5 16.5 40.5 11 32 11c-8.2 0-15 5.8-16.5 13.7C10 25.5 6 30 6 35.6 6 41.5 11 46 18 46Z"
              fill="#BAE6FD"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Cute blinking face on cloud */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-2.2s")}>
              <circle cx="24.5" cy="29.5" r="2.3" fill={INK} />
              <circle cx="39.5" cy="29.5" r="2.3" fill={INK} />
              <circle cx="23.8" cy="28.7" r="0.7" fill="#FFFDF7" />
              <circle cx="38.8" cy="28.7" r="0.7" fill="#FFFDF7" />
            </g>
            <ellipse cx="20" cy="33.5" rx="2.8" ry="1.7" fill={BLUSH} />
            <ellipse cx="44" cy="33.5" rx="2.8" ry="1.7" fill={BLUSH} />
            <path d="M29 33.5c1.4 1.8 4.6 1.8 6 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
            {/* Happy swaying mint backup shield/arrow pill */}
            <g
              className={compact ? undefined : "animate-kawaii-tail"}
              style={compact ? undefined : svgMotionStyle("center", "-0.6s")}
            >
              <circle cx="32" cy="48" r="8.5" fill="#6EE7B7" stroke={INK} strokeWidth="2.4" />
              <path
                d="M32 43.8v8.4M28.5 48.8 32 52.3l3.5-3.5"
                stroke={INK}
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        </svg>
      );

    case "room":
      // Cozy pastel teal & cream clinic house buddy
      return (
        <svg viewBox="0 0 64 64" fill="none" className={baseClass} aria-hidden="true">
          {!compact && (
            <g className="animate-twinkle-2d" style={svgMotionStyle("center", "-0.6s")}>
              <path
                d="M11 12.5 12.1 15.1 14.7 16.2 12.1 17.3 11 19.9 9.9 17.3 7.3 16.2 9.9 15.1Z"
                fill="#FDE68A"
                stroke={INK}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </g>
          )}
          <g {...breatheGroupProps(compact, "bottom center", "-1.1s")}>
            {/* Cute butter chimney */}
            <rect
              x="40.5"
              y="13"
              width="7.5"
              height="12"
              rx="3"
              fill="#FDE68A"
              stroke={INK}
              strokeWidth="2.4"
            />
            {!compact && (
              <g className="animate-kawaii-note" style={svgMotionStyle("center", "-1.4s")}>
                <circle cx="44.2" cy="8.5" r="2.2" fill="#FDA4AF" stroke={INK} strokeWidth="1.5" />
              </g>
            )}
            {/* Warm cream room body */}
            <rect
              x="13"
              y="28"
              width="38"
              height="27"
              rx="8"
              fill="#FFFDF7"
              stroke={INK}
              strokeWidth="2.5"
            />
            {/* Cozy pastel teal roof */}
            <path
              d="M8.5 30.5 29.8 12.6a3.5 3.5 0 0 1 4.4 0L55.5 30.5c1.5 1.3.6 3.5-1.4 3.5H9.9c-2 0-2.9-2.2-1.4-3.5Z"
              fill="#5EEAD4"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Little butter gable emblem on roof */}
            <circle
              cx="32"
              cy="24.5"
              r="3.6"
              fill="#FDE68A"
              stroke={INK}
              strokeWidth="2"
            />
            {/* Cute blinking face on room front */}
            <g className="animate-blink-2d" style={svgMotionStyle("center", "-2.4s")}>
              <circle cx="24.5" cy="42" r="2.2" fill={INK} />
              <circle cx="39.5" cy="42" r="2.2" fill={INK} />
              <circle cx="23.8" cy="41.3" r="0.7" fill="#FFFDF7" />
              <circle cx="38.8" cy="41.3" r="0.7" fill="#FFFDF7" />
            </g>
            <ellipse cx="20" cy="45.6" rx="2.7" ry="1.5" fill={BLUSH} />
            <ellipse cx="44" cy="45.6" rx="2.7" ry="1.5" fill={BLUSH} />
            <path
              d="M29.2 45.8c1.3 1.7 4.3 1.7 5.6 0"
              stroke={INK}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
        </svg>
      );
  }
}

const ROUTE_MASCOT_MAP: Record<string, KawaiiMascotType> = {
  "/dashboard": "dino",
  "/guide": "book",
  "/inventory": "box",
  "/kits": "star",
  "/rooms": "room",
  "/scan": "scan",
  "/stock-opname": "clipboard",
  "/barcode-studio": "barcode",
  "/requests": "clipboard",
  "/archives": "folder",
  "/deliveries": "truck",
  "/vault": "vault",
  "/backup": "backup",
  "/audit-log": "history",
  "/recycle-bin": "trash",
  "/settings": "gear",
};

export function getMascotForRoute(href: string): KawaiiMascotType {
  if (href in ROUTE_MASCOT_MAP) {
    return ROUTE_MASCOT_MAP[href];
  }
  const matchedPrefix = Object.keys(ROUTE_MASCOT_MAP).find(
    (route) => href.startsWith(`${route}/`),
  );
  return matchedPrefix ? ROUTE_MASCOT_MAP[matchedPrefix] : "chiikawa";
}

export function KawaiiNavIcon({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <KawaiiMascotSvg
      type={getMascotForRoute(href)}
      compact
      className={cn(
        "size-5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105",
        className,
      )}
    />
  );
}
