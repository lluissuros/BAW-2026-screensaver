#version 300 es

layout(location = 0) in vec2 aPos;

uniform vec2 uScale; // how much of the screen the composition covers, per axis

out vec2 vUv;

void main() {
  vUv = 0.5 + aPos * 0.5;
  gl_Position = vec4(aPos * uScale, 0.0, 1.0);
}
