export const MAPS = [
  {
    id: "warehouse",
    name: "Warehouse",
    type: "Indoor Free-ride",
    description:
      "An indoor space for a quiet free-ride session. Park editing is unavailable in this alpha.",
    preview: "/previews/warehouse.webp",
    spawn: { x: -12, z: -24, yaw: 0 },
    environment: "warehouse",
  },
  {
    id: "outdoor",
    name: "Boulder City, NV",
    type: "Veterans Memorial Park / Wood + Metal + BMX + Lake",
    description:
      "Veterans Memorial Park's wooden transitions, metal street park and BMX track, with Lakeside Drive winding east past the grass field to the lake and dive dock.",
    preview: "/previews/outdoor.webp",
    spawn: { x: -10, z: -19, yaw: 0 },
    environment: "outdoor",
  },
  {id:'b_hill',name:'B Hill',type:'Downhill / Neighborhood descent',description:'A long winding descent through a hillside desert neighborhood. Carve, tuck, slide and brake on scooter or longboard.',preview:'/previews/b-hill.webp',spawn:{x:0,z:-20,yaw:0},environment:'hill'},
  {id:'church',name:'The Church',type:'Street spot / 11-stair, courtyard, DIY lot + indoor sanctuary park',description:'A desert church turned skate spot: an eleven-stair with a hubba either side, a plaza under the steel canopy, the side courtyard, the loading-dock DIY lot and a ramp session in the sanctuary.',preview:'/previews/church.webp',spawn:{x:0,z:-30,yaw:0},environment:'church'},
  {id:'techno_gravity',name:'Techno Gravity Shop',type:'Independent shop / Rideable frontage + DIY alley',description:'Explore the local shop, inspect parts, spend earned Coins and ride the homemade alley spot.',preview:'/previews/techno-gravity.webp',spawn:{x:0,z:-11,yaw:0},environment:'shop'},
] as const;
export type MapId = (typeof MAPS)[number]["id"];

