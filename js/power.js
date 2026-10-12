// Building power runs independently of audio permission and rendering speed.
// dt is real elapsed active-tab time, not the physics timestep (capped at 50 ms).
(function (root) {
  'use strict';
  function createPower(random = Math.random) {
    let phase = 'on', elapsed = 0, duration = 0, supply = 1;
    let next = 25 + random() * 25;
    function trigger(seconds = 4 + random() * 5) {
      phase = 'off'; elapsed = 0; duration = seconds; supply = 0;
    }
    function update(dt) {
      dt = Math.max(0, dt);
      if (phase === 'on') {
        next -= dt;
        if (next <= 0) trigger();
      } else {
        elapsed += dt;
        if (phase === 'off' && elapsed >= duration) {
          elapsed -= duration; phase = 'restoring';
        }
        if (phase === 'restoring') {
          supply = Math.min(1, elapsed / 3.5);
          if (supply === 1) { phase = 'on'; elapsed = 0; next = 45 + random() * 70; }
        }
      }
      return supply;
    }
    return { trigger, update, state: () => ({phase, supply, next, elapsed}) };
  }
  root.createBuildingPower = createPower;
  if (typeof module !== 'undefined') module.exports = createPower;
})(globalThis);
