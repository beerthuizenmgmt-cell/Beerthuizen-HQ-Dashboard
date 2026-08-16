/* eslint-disable @next/next/no-img-element */

export type AvatarAgent = {
  name: string;
  emoji?: string | null;
  color?: string | null;
  avatarUrl?: string | null;
};

const SIZES = {
  xs: { box: "h-5 w-5", text: "text-[10px]", radius: "rounded-md" },
  sm: { box: "h-8 w-8", text: "text-sm", radius: "rounded-lg" },
  md: { box: "h-10 w-10", text: "text-lg", radius: "rounded-xl" },
  lg: { box: "h-14 w-14", text: "text-2xl", radius: "rounded-2xl" },
  xl: { box: "h-20 w-20", text: "text-3xl", radius: "rounded-2xl" },
} as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/// Het gezicht van een agent. Drie niveaus, in deze volgorde: een geüploade of
/// gelinkte afbeelding, anders zijn emoji, anders zijn initialen. Er staat dus
/// altijd iets herkenbaars — nooit een leeg vlak.
export function AgentAvatar({
  agent,
  size = "md",
  className = "",
}: {
  agent: AvatarAgent;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const accent = agent.color ?? "#6366f1";
  const style = SIZES[size];

  if (agent.avatarUrl) {
    return (
      <img
        src={agent.avatarUrl}
        alt={agent.name}
        className={`${style.box} ${style.radius} shrink-0 object-cover ${className}`}
        style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 45%, transparent)` }}
      />
    );
  }

  return (
    <span
      className={`${style.box} ${style.radius} ${style.text} flex shrink-0 items-center justify-center ${className}`}
      style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)` }}
      title={agent.name}
    >
      {agent.emoji ? (
        agent.emoji
      ) : (
        <span className="font-semibold" style={{ color: accent }}>
          {initials(agent.name)}
        </span>
      )}
    </span>
  );
}
