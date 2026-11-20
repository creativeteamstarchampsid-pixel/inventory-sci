export function KawaiiBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none print:hidden"
    >
      {/* Top-right soft drifting pastel cloud */}
      <svg
        viewBox="0 0 140 68"
        className="animate-cloud-2d absolute top-20 -right-8 hidden w-44 opacity-45 sm:block dark:opacity-[0.14]"
      >
        <path
          d="M32 54h76a18 18 0 0 0 2.5-35.8A24 24 0 0 0 64 12a22 22 0 0 0-27 17A15 15 0 0 0 32 54Z"
          className="fill-[#FFFDF7] stroke-[#2C2623]/40 dark:fill-[#2C2522] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <circle cx="52" cy="37" r="3" className="fill-[#7CC4FA]/45" />
        <circle cx="88" cy="39" r="2.5" className="fill-[#FDA4AF]/45" />
      </svg>

      {/* Lower-left soft drifting pastel cloud */}
      <svg
        viewBox="0 0 128 62"
        style={{ animationDelay: "-3.4s" }}
        className="animate-cloud-2d absolute bottom-8 left-4 hidden w-36 opacity-40 md:left-68 lg:block dark:opacity-[0.12]"
      >
        <path
          d="M28 49h70a15 15 0 0 0 2-29.8A20 20 0 0 0 60 13a19 19 0 0 0-24 15A13 13 0 0 0 28 49Z"
          className="fill-[#FEF9E7] stroke-[#2C2623]/35 dark:fill-[#332B27] dark:stroke-[#C8B9AE]/30"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>

      {/* Twinkling tiny 4-point pastel stars tucked near edges */}
      <svg
        viewBox="0 0 32 32"
        className="animate-twinkle-2d absolute top-32 right-12 hidden size-5 opacity-60 md:block dark:opacity-25"
      >
        <path
          d="M16 3 L19 13 L29 16 L19 19 L16 29 L13 19 L3 16 L13 13 Z"
          className="fill-[#FDE68A] stroke-[#2C2623]/55 dark:stroke-[#C8B9AE]/40"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      <svg
        viewBox="0 0 32 32"
        style={{ animationDelay: "0.9s" }}
        className="animate-twinkle-2d absolute top-[42%] left-6 hidden size-4 opacity-50 xl:left-70 xl:block dark:opacity-20"
      >
        <path
          d="M16 3 L19 13 L29 16 L19 19 L16 29 L13 19 L3 16 L13 13 Z"
          className="fill-[#7CC4FA] stroke-[#2C2623]/50 dark:stroke-[#C8B9AE]/40"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      <svg
        viewBox="0 0 32 32"
        style={{ animationDelay: "1.7s" }}
        className="animate-twinkle-2d absolute right-16 bottom-24 hidden size-5 opacity-55 sm:block dark:opacity-22"
      >
        <path
          d="M16 3 L19 13 L29 16 L19 19 L16 29 L13 19 L3 16 L13 13 Z"
          className="fill-[#FDA4AF] stroke-[#2C2623]/50 dark:stroke-[#C8B9AE]/40"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      {/* Floating gentle music notes */}
      <span className="animate-kawaii-note absolute top-48 right-6 hidden text-lg font-black text-[#2AB673]/50 lg:block dark:text-[#4ADE9B]/22">
        ♪
      </span>
      <span
        style={{ animationDelay: "1.9s" }}
        className="animate-kawaii-note absolute bottom-28 left-8 hidden text-base font-black text-[#FB7185]/45 xl:left-72 xl:block dark:text-[#FDA4AF]/20"
      >
        ♪
      </span>

      {/* Floating mini pastel petal puff on mid-right margin */}
      <svg
        viewBox="0 0 44 44"
        className="animate-float-2d-reverse absolute top-[62%] right-4 hidden size-9 opacity-40 xl:block dark:opacity-[0.15]"
      >
        <circle
          cx="22"
          cy="12"
          r="7"
          className="fill-[#D8F8E7] stroke-[#2C2623]/40 dark:fill-[#1E352B] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2"
        />
        <circle
          cx="22"
          cy="32"
          r="7"
          className="fill-[#D8F8E7] stroke-[#2C2623]/40 dark:fill-[#1E352B] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2"
        />
        <circle
          cx="12"
          cy="22"
          r="7"
          className="fill-[#D8F8E7] stroke-[#2C2623]/40 dark:fill-[#1E352B] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2"
        />
        <circle
          cx="32"
          cy="22"
          r="7"
          className="fill-[#D8F8E7] stroke-[#2C2623]/40 dark:fill-[#1E352B] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2"
        />
        <circle
          cx="22"
          cy="22"
          r="5.5"
          className="fill-[#FDE68A] stroke-[#2C2623]/45 dark:fill-[#4A3B1E] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2"
        />
      </svg>

      {/* Polite peeking Chiikawa-inspired pastel puff doodle in bottom-right corner */}
      <svg
        viewBox="0 0 84 68"
        className="animate-float-2d-slow absolute right-4 bottom-3 hidden w-16 opacity-45 md:block dark:opacity-[0.16]"
      >
        {/* Tiny round ears */}
        <circle
          cx="25"
          cy="20"
          r="9"
          className="fill-[#FFFDF7] stroke-[#2C2623]/45 dark:fill-[#2C2522] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2.4"
        />
        <circle
          cx="59"
          cy="20"
          r="9"
          className="fill-[#FFFDF7] stroke-[#2C2623]/45 dark:fill-[#2C2522] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2.4"
        />
        <circle cx="25" cy="20" r="4.2" className="fill-[#FFE4EA] dark:fill-[#FDA4AF]/35" />
        <circle cx="59" cy="20" r="4.2" className="fill-[#FFE4EA] dark:fill-[#FDA4AF]/35" />
        {/* Round mochi puff body */}
        <ellipse
          cx="42"
          cy="41"
          rx="27"
          ry="22"
          className="fill-[#FFFDF7] stroke-[#2C2623]/45 dark:fill-[#2C2522] dark:stroke-[#C8B9AE]/35"
          strokeWidth="2.4"
        />
        {/* Cozy pastel cheeks */}
        <ellipse cx="26" cy="43" rx="4.5" ry="2.6" className="fill-[#FDA4AF]/75" />
        <ellipse cx="58" cy="43" rx="4.5" ry="2.6" className="fill-[#FDA4AF]/75" />
        {/* Tiny dot eyes + happy mini smile */}
        <circle cx="33" cy="38" r="2.2" className="fill-[#2C2623]/65 dark:fill-[#FDF8F0]/60" />
        <circle cx="51" cy="38" r="2.2" className="fill-[#2C2623]/65 dark:fill-[#FDF8F0]/60" />
        <path
          d="M38 43 Q42 46.5 46 43"
          fill="none"
          className="stroke-[#2C2623]/60 dark:stroke-[#FDF8F0]/55"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
