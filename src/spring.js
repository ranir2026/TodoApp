// Minimal interruptible spring using Apple's damping-ratio / response parameters.
// Starts from the current value and velocity, so a new call can take over mid-flight.
export function animateSpring({ from, to, velocity = 0, damping = 1, response = 0.35, onUpdate, onComplete }) {
  const stiffness = (2 * Math.PI / response) ** 2;
  const friction = (4 * Math.PI * damping) / response;
  let x = from;
  let v = velocity;
  let last = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    let dt = Math.min((now - last) / 1000, 0.064);
    last = now;
    // Fixed sub-steps keep the integration stable on slow frames
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      v += (-stiffness * (x - to) - friction * v) * h;
      x += v * h;
      dt -= h;
    }
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 20) {
      onUpdate(to);
      onComplete?.();
      return;
    }
    onUpdate(x);
    frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}

// Apple's momentum projection: where a flick would come to rest
export function projectMomentum(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

// Progressive resistance past a boundary
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
