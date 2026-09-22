import { TUNE } from '../core/config';
import type { LandingQuality } from "../core/events";
export interface TrickPrimitives {
  bodyYaw: number;
  flipPitch: number;
  deckAngle: number;
  barAngle: number;
  deckTurns: number;
  barTurns: number;
  states: string[];
  out: boolean;
  direction: { body: number; deck: number; bars: number };
  fakieSeconds?: number;
  deckCatches?: number[];
  barCatches?: number[];
  stance?: "regular" | "goofy";
  naturalWhipDirection?: number;
  originalDeckDirection?: number;
  deckReversals?: { angle: number; from: number; to: number; side: string }[];
  barReversals?: { angle: number; from: number; to: number; side: string }[];
  finger?: boolean;
  fingerTurns?: number;
  briAngle?: number;
  kicklessAngle?: number;
  kicklessHistory?: {
    originalDirection: number;
    direction: number;
    stance: string;
    side: string;
    deckAngle: number;
    startAngle: number;
    targetAngle: number;
    completed: boolean;
  }[];
  motionOrder?: string[];
}
export interface ResolvedTrick {
  name: string;
  recognized: string | null;
  components: string[];
  raw: TrickPrimitives;
}
export interface TrickRecord extends ResolvedTrick {
  id: number;
  landing: LandingQuality;
}
export const completedDegrees = (radians: number) => {
  const actual = (Math.abs(radians) * 180) / Math.PI,
    nearest = Math.round(actual / 90) * 90;
  if(actual < TUNE.firstSpinThreshold)return 0;
  return Math.abs(actual - nearest) <= TUNE.spinNameTolerance + 1e-9 ? nearest : Math.floor(actual / 90) * 90;
};
const counted = (n: number, word: string) =>
  `${n === 1 ? "" : n === 2 ? "Double " : n === 3 ? "Triple " : n === 4 ? "Quad " : `${n}× `}${word}`;
// Rules consume primitives, never button states or animations. Additional names can
// be registered here without altering scooter physics or losing the source motion.
const rules = [
  {
    id: "truck-driver",
    name: "Truck Driver",
    matches: (raw: TrickPrimitives) =>
      completedDegrees(raw.bodyYaw) === 360 &&
      Math.abs(raw.barTurns) === 1 &&
      Math.abs(raw.flipPitch) < 0.2,
  },
];
export function resolveTrick(raw: TrickPrimitives): ResolvedTrick {
  const degrees = completedDegrees(raw.bodyYaw),
    parts: string[] = [];
  const downside =
    degrees >= 180 &&
    raw.deckTurns !== 0 &&
    raw.direction.body * raw.direction.deck < 0;
  const sequence = (
    turns: number,
    word: string,
    catches: number[] = [],
  ): string => {
    let previous = 0;
    const parts: string[] = [];
    for (const end of [
      ...catches.filter((n) => n > 0 && n < Math.abs(turns)),
      Math.abs(turns),
    ]) {
      if (end > previous) parts.push(counted(end - previous, word));
      previous = end;
    }
    return parts.join(" to ");
  };
  const natural = raw.naturalWhipDirection ?? 1;
  const deckWord = raw.finger
    ? raw.direction.deck === natural
      ? "Fingerwhip"
      : "Opposite Fingerwhip"
    : raw.deckTurns * natural > 0
      ? "Tailwhip"
      : "Heelwhip";
  const rewindName = (word: string, count: number) =>
    word +
    " Rewind" +
    Array(Math.max(0, count - 1))
      .fill(" + Rewind")
      .join("");
  let rawDeck = raw.deckReversals?.length
    ? rewindName(
        (raw.originalDeckDirection ?? 1) * natural > 0 ? "Whip" : "Heel",
        raw.deckReversals.length,
      )
    : raw.deckTurns
      ? sequence(raw.deckTurns, deckWord, raw.deckCatches)
      : "";
  if (
    raw.fingerTurns !== undefined &&
    raw.fingerTurns > 0 &&
    raw.fingerTurns < Math.abs(raw.deckTurns) &&
    !raw.deckReversals?.length
  ) {
    rawDeck =
      counted(
        Math.abs(raw.deckTurns) - raw.fingerTurns,
        raw.deckTurns * natural > 0 ? "Tailwhip" : "Heelwhip",
      ) +
      " + " +
      counted(raw.fingerTurns, deckWord);
  }
  const deck =
    downside && !raw.deckReversals?.length
      ? counted(
          Math.abs(raw.deckTurns),
          raw.deckTurns > 0 ? "Downside Whip" : "Downside Heelwhip",
        )
      : rawDeck;
  const bars = raw.barReversals?.length
    ? rewindName("Bar", raw.barReversals.length)
    : raw.barTurns
      ? sequence(raw.barTurns, "Barspin", raw.barCatches)
      : "";
  if (deck) parts.push(deck);
  if (bars) parts.push(bars);
  const briTurns = Math.trunc(
      (Math.abs(raw.briAngle ?? 0) + 0.2) / (Math.PI * 2),
    ),
    kicklessTurns = Math.trunc(
      (Math.abs(raw.kicklessAngle ?? 0) + 0.2) / (Math.PI * 2),
    );
  const extras: string[] = [];
  if (briTurns)
    extras.push(
      counted(
        briTurns,
        (raw.briAngle ?? 0) * natural > 0 ? "Bri Flip" : "Inward Bri",
      ),
    );
  if (raw.kicklessHistory?.length) {
    for (const event of raw.kicklessHistory.filter((event) => event.completed))
      extras.push(
        event.direction * natural > 0 ? "Kickless" : "Opposite Kickless",
      );
  } else if (kicklessTurns)
    extras.push(
      counted(
        kicklessTurns,
        (raw.kicklessAngle ?? 0) * natural > 0
          ? "Kickless"
          : "Opposite Kickless",
      ),
    );
  parts.push(...extras);
  parts.push(...raw.states);
  const components = [
    ...(degrees ? [`${degrees}°`] : []),
    ...(rawDeck ? [rawDeck] : []),
    ...(bars ? [bars] : []),
    ...extras,
    ...raw.states,
  ];
  const rule = rules.find((rule) => rule.matches(raw));
  let name = rule
    ? [rule.name, ...(deck ? [deck] : []), ...extras, ...raw.states].join(" + ")
    : `${degrees && !(downside && degrees === 180) ? `${degrees}° ` : ""}${parts.join(" + ")}`.trim();
  if (
    raw.motionOrder?.join(",") === "deck,bri,deck" &&
    !raw.deckReversals?.length &&
    briTurns === 1
  ) {
    name = [
      degrees ? `${degrees}° Buttercup` : "Buttercup",
      bars,
      ...raw.states,
    ]
      .filter(Boolean)
      .join(" + ");
  }
  if (raw.out && name) name += " Out";
  return {
    name,
    recognized: rule?.id ?? (downside ? "downside-whip" : null),
    components,
    raw: { ...raw, states: [...raw.states], direction: { ...raw.direction } },
  };
}
