import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Simulation } from "../physics/simulation";
import type { InputFrame } from "../input/input";
import { TUNE } from "../core/config";
import { OUTDOOR } from "../park/park";
import { GROUPS } from "../physics/groups";
import type { DropInMarker } from "./drop-in";
export interface SessionMarker {
  mapId: string;
  position: [number, number, number];
  yaw: number;
  pitch: number;
  roll: number;
  normal: [number, number, number];
  dropIn: DropInMarker | null;
}
export class MarkerSystem {
  saved: SessionMarker | null = null;
  hold = 0;
  private consumed = false;
  clear() {
    this.saved = null;
    this.hold = 0;
    this.consumed = false;
  }
  private feedback(s: Simulation, message: string, progress = 0) {
    s.events.emit({ type: "marker", message, progress });
  }
  private clearAt(s: Simulation, position: THREE.Vector3, yaw = s.yaw) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const guardPosition = new THREE.Vector3(0, 0.43, 0.26)
      .applyQuaternion(rotation)
      .add(position);
    return (
      !s.world.intersectionWithShape(
        guardPosition,
        rotation,
        new RAPIER.Capsule(0.25, 0.13),
        undefined,
        GROUPS.railGuard,
        undefined,
        s.body,
      ) &&
      !s.world.intersectionWithShape(
        position,
        { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Ball(0.18),
        undefined,
        undefined,
        undefined,
        s.body,
      )
    );
  }
  set(s: Simulation) {
    if (
      !s.grounded ||
      s.sitting ||
      s.mantle ||
      s.dropIn.phase === "commit" ||
      s.grind ||
      s.manual.active ||
      s.state === "Bail" ||
      s.recovery > 0.3 ||
      !Number.isFinite(s.position.lengthSq() + s.yaw) ||
      !this.clearAt(s, s.position)
    ) {
      this.feedback(s, "CAN'T SET MARKER HERE");
      return false;
    }
    this.saved = {
      mapId: OUTDOOR ? "outdoor" : "warehouse",
      position: s.position.toArray(),
      yaw: s.yaw,
      pitch: s.pitch,
      roll: 0,
      normal: s.normal.toArray(),
      dropIn: s.dropIn.markerState(),
    };
    this.feedback(s, "MARKER SET", 1);
    return true;
  }
  returnTo(s: Simulation) {
    const mark = this.saved;
    if (!mark) {
      this.feedback(s, "NO MARKER SET");
      return false;
    }
    const position = new THREE.Vector3(...mark.position);
    // A ready drop-in is a verified position on a transition. The general
    // clearance capsule is intentionally too conservative for that stance.
    const restoringReadyDropIn = mark.dropIn?.phase === "ready";
    if (
      mark.mapId !== (OUTDOOR ? "outdoor" : "warehouse") ||
      (!restoringReadyDropIn && !this.clearAt(s, position, mark.yaw))
    ) {
      this.feedback(s, "CAN'T RETURN TO MARKER HERE");
      return false;
    }
    s.reset();
    s.position.copy(position);
    s.previousPosition.copy(position);
    s.yaw = mark.yaw;
    s.previousYaw = mark.yaw;
    s.pitch = mark.pitch;
    s.roll = mark.roll;
    s.normal.fromArray(mark.normal);
    s.dropIn.restoreMarker(mark.dropIn ?? null);
    if (mark.dropIn) {
      s.walking = false;
      s.running = false;
      s.grounded = true;
      s.state = mark.dropIn.phase === "ready" ? "DropInReady" : "DropInCommit";
    }
    s.body.setTranslation(position, true);
    s.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        mark.yaw,
      ),
      true,
    );
    this.feedback(s, "RETURN TO MARKER");
    return true;
  }
  step(dt: number, input: InputFrame, s: Simulation) {
    if (input.held.marker > 0.5) {
      this.hold += dt;
      if (!this.consumed) {
        if (this.hold >= TUNE.markerHoldDuration) {
          this.consumed = true;
          this.set(s);
        } else if (this.hold > 0.12)
          this.feedback(
            s,
            "SETTING MARKER",
            this.hold / TUNE.markerHoldDuration,
          );
      }
    }
    if (input.released.marker) {
      const tap = !this.consumed;
      this.hold = 0;
      this.consumed = false;
      if (tap) return this.returnTo(s);
    }
    if (input.held.marker === 0 && !input.released.marker) {
      this.hold = 0;
      this.consumed = false;
    }
    return false;
  }
}
