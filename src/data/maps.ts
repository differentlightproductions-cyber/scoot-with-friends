export const MAPS = [
  {
    id: "warehouse",
    name: "Warehouse 01",
    type: "Indoor / Street + Transition",
    description:
      "Long runways, five stairs, rails, a bowl and broad quarter pipes.",
    preview: "/previews/warehouse.png",
    spawn: { x: -12, z: -24, yaw: 0 },
    environment: "warehouse",
  },
  {
    id: "outdoor",
    name: "Sunset Plaza 02",
    type: "Outdoor / Modular Park",
    description:
      "Aligned tall quarters, a tight spine and connected small and large transfers.",
    preview: "/previews/outdoor.png",
    spawn: { x: -10, z: -19, yaw: 0 },
    environment: "outdoor",
  },
] as const;
export type MapId = (typeof MAPS)[number]["id"];

