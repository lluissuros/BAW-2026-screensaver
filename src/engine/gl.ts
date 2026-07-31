/** Small WebGL2 helpers. Nothing clever — just the boilerplate, named. */

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false, // we render into an offscreen target and downsample instead
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  })
  if (!gl) throw new Error('WebGL2 is not available in this browser')
  return gl
}

function compile(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Failed to compile ${label}:\n${log}`)
  }
  return shader
}

export class Shader {
  readonly program: WebGLProgram
  private readonly locations = new Map<string, WebGLUniformLocation>()

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
    label: string,
  ) {
    const vert = compile(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex shader`)
    const frag = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment shader`)
    const program = gl.createProgram()!
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Failed to link ${label}:\n${log}`)
    }
    this.program = program

    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i)
      if (!info) continue
      const name = info.name.replace(/\[0\]$/, '')
      const location = gl.getUniformLocation(program, info.name)
      if (location) this.locations.set(name, location)
    }
  }

  use(): void {
    this.gl.useProgram(this.program)
  }

  private at(name: string): WebGLUniformLocation | null {
    return this.locations.get(name) ?? null
  }

  f(name: string, value: number): void {
    const l = this.at(name)
    if (l) this.gl.uniform1f(l, value)
  }

  f2(name: string, x: number, y: number): void {
    const l = this.at(name)
    if (l) this.gl.uniform2f(l, x, y)
  }

  f3(name: string, x: number, y: number, z: number): void {
    const l = this.at(name)
    if (l) this.gl.uniform3f(l, x, y, z)
  }

  i(name: string, value: number): void {
    const l = this.at(name)
    if (l) this.gl.uniform1i(l, value)
  }

  mat3(name: string, value: Float32Array): void {
    const l = this.at(name)
    if (l) this.gl.uniformMatrix3fv(l, false, value)
  }
}

/** A unit quad from (-1,-1) to (1,1), which every draw call in this app uses. */
export function createUnitQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!
  const buffer = gl.createBuffer()!
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}

export interface Texture {
  handle: WebGLTexture
  width: number
  height: number
}

export async function loadTexture(gl: WebGL2RenderingContext, url: string): Promise<Texture> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'premultiply' })
  const handle = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, handle)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  gl.generateMipmap(gl.TEXTURE_2D)
  // CLAMP_TO_EDGE plus the transparent border that prepare-assets.sh adds means UVs pushed
  // outside 0..1 by the warp sample transparent pixels rather than smearing the edge row.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  const { width, height } = bitmap
  bitmap.close()
  return { handle, width, height }
}

export interface RenderTarget {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

export function createRenderTarget(gl: WebGL2RenderingContext, width: number, height: number): RenderTarget {
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const framebuffer = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Render target ${width}×${height} is not usable (status 0x${status.toString(16)})`)
  }
  return { framebuffer, texture, width, height }
}

export function deleteRenderTarget(gl: WebGL2RenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer)
  gl.deleteTexture(target.texture)
}

/** '#fb80a4' → [0.984, 0.502, 0.643] */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '')
  const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return [1, 0, 0]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
