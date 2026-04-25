// The full timer handler uses MIN_DURATION_S, we need to override it for testing.
// In the actual file, MIN_DURATION_S is a const.
const originalMinDurationS = MIN_DURATION_S;

function setMinTimerDuration(newMinDuration) {
  MIN_DURATION_S = newMinDuration;
  console.log(
    `[Test Mock] MIN_DURATION_S overridden from ${originalMinDurationS} to ${newMinDuration}`,
  );
}

function restoreMinDuration() {
  MIN_DURATION_S = originalMinDurationS;
  console.log(`[Test Mock] MIN_DURATION_S restored to ${originalMinDurationS}`);
}

module.exports = {
  setMinTimerDuration,
  restoreMinDuration,
};
