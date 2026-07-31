#version 300 es

layout(location = 0) in vec2 aPos; // unit quad, -1..1

uniform mat3 uModel;      // unit quad -> design-space pixels
uniform vec2 uResolution; // design canvas size
uniform vec2 uUvHalf;     // half the UV window this quad covers

out vec2 vUv;

void main() {
  vUv = 0.5 + aPos * uUvHalf;

  vec3 p = uModel * vec3(aPos, 1.0);

  // Design space has y pointing down, like the artboard the artist worked on. Flip it here
  // so nothing downstream has to think about it.
  gl_Position = vec4(
    p.x / uResolution.x * 2.0 - 1.0,
    1.0 - p.y / uResolution.y * 2.0,
    0.0,
    1.0
  );
}
