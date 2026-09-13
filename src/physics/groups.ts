// Separate the stem/rider rail guard from floor support so existing ramp feel stays intact.
export const GROUPS = {
  chassisSurfaceOnly: (2 << 16) | 1,
  surface: (1 << 16) | 0xffff,
  chassis: (2 << 16) | 5,
  rail: (4 << 16) | 10,
  railGuard: (8 << 16) | 4,
};
