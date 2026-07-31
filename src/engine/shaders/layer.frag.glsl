#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform float uOpacity;
uniform float uPhase; // 0..1, already offset for this layer
uniform float uSeed;

uniform vec2 uWobble; // UV displacement amplitude, per axis
uniform float uWobbleScale;
uniform float uWobbleRate;

uniform float uRipple; // UV displacement along x
uniform float uRippleWaves;
uniform float uRippleRate;

uniform vec2 uBleed; // UV tap radius for the dilate/erode ring
uniform float uBleedMid;

const float TAU = 6.28318530718;

/**
 * Smooth noise that loops exactly.
 *
 * Every term's temporal frequency is a whole number of cycles per loop, so the field at
 * phase 1.0 is identical to the field at phase 0.0 — the shape can breathe all night with no
 * seam to catch the eye. Directions are spaced by the golden angle so the terms never line
 * up into a visible grating, which is what separates "organic" from "rippling flag".
 */
float loopNoise(vec2 p, float phase, float seed) {
  float sum = 0.0;
  float norm = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float angle = seed * 1.7 + fi * 2.39996;
    vec2 dir = vec2(cos(angle), sin(angle));
    float spatial = 1.0 + fi * 0.83;
    float temporal = 1.0 + floor(fi * 1.5); // whole cycles per loop
    float weight = 1.0 / (1.0 + fi);
    sum += weight * sin(dot(p, dir) * spatial + TAU * phase * temporal + seed * 3.1 + fi);
    norm += weight;
  }
  return sum / norm;
}

vec2 warpUv(vec2 uv) {
  if (uWobble.x > 0.0 || uWobble.y > 0.0) {
    vec2 q = uv * uWobbleScale;
    float t = uPhase * uWobbleRate;
    // Domain warp: offset the sample point of one noise field by another. Cheap, and it is
    // what turns regular waves into something that reads as flow rather than as a pattern.
    vec2 pre = vec2(loopNoise(q, t, uSeed), loopNoise(q + 4.7, t, uSeed + 11.3));
    vec2 d = vec2(
      loopNoise(q + pre * 0.6, t, uSeed + 23.1),
      loopNoise(q + pre * 0.6 + 9.2, t, uSeed + 37.7)
    );
    uv += d * uWobble;
  }
  if (uRipple > 0.0) {
    uv.x += uRipple * sin(TAU * (uv.y * uRippleWaves - uPhase * uRippleRate));
  }
  return uv;
}

void main() {
  vec2 uv = warpUv(vUv);
  vec4 c = texture(uTex, uv); // premultiplied alpha

  if (uBleed.x > 0.0) {
    // Average coverage over a ring, then re-threshold it. A midpoint under 0.5 dilates the
    // shape, over 0.5 erodes it, so the painted edge creeps outwards and back like wet ink.
    vec4 acc = c;
    for (int i = 0; i < 8; i++) {
      float a = TAU * float(i) / 8.0;
      acc += texture(uTex, uv + vec2(cos(a), sin(a)) * uBleed);
    }
    float coverage = smoothstep(uBleedMid - 0.22, uBleedMid + 0.22, acc.a / 9.0);
    vec3 rgb = acc.a > 0.0001 ? acc.rgb / acc.a : vec3(0.0);
    c = vec4(rgb * coverage, coverage);
  }

  fragColor = c * uOpacity;
}
