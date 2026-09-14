export const MAPS = [
  {
    id: "warehouse",
    name: "Warehouse",
    type: "Build Your Own",
    description:
      "An empty indoor creator space. Dismount and hold D-Pad Left to build your own riding lines.",
    preview: "/previews/warehouse.png",
    spawn: { x: -12, z: -24, yaw: 0 },
    environment: "warehouse",
  },
  {
    id: "outdoor",
    name: "Veterans Memorial Park",
    type: "Outdoor / Wood + Metal + Trails",
    description:
      "Wooden transitions, a separate metal street park, BMX rollers and connected lakeside paths.",
    preview: "/previews/outdoor.png",
    spawn: { x: -10, z: -19, yaw: 0 },
    environment: "outdoor",
  },
  {id:'techno_gravity',name:'Techno Gravity Shop',type:'Independent shop / Rideable frontage + DIY alley',description:'Explore the local shop, inspect parts, spend earned Credit and ride the homemade alley spot.',preview:'/previews/techno-gravity.png',spawn:{x:0,z:-11,yaw:0},environment:'shop'},
] as const;
export type MapId = (typeof MAPS)[number]["id"];

