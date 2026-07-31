#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform float uGrain;
uniform float uVignette;
uniform float uGrainSeed;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

void main() {
  vec3 c = texture(uTex, vUv).rgb;

  if (uVignette > 0.0) {
    float r = length(vUv - 0.5);
    c *= 1.0 - uVignette * smoothstep(0.35, 0.95, r);
  }

  if (uGrain > 0.0) {
    // A flat field of fuchsia on a large panel bands visibly. A touch of grain, cycled on a
    // whole number of frames so it loops too, hides it.
    c += (hash(vec3(gl_FragCoord.xy, uGrainSeed)) - 0.5) * uGrain;
  }

  fragColor = vec4(c, 1.0);
}
