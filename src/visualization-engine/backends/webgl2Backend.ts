import { parseCssColor, rgbaToFloatArray } from '../colorUtils';
import type { DrawCommand, FillRoundedRectCommand, StrokePolylineCommand, VisualizationBackend, VisualizationViewport } from '../types';

const RECT_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aVertex;
layout(location = 1) in vec4 aRect;
layout(location = 2) in float aRadius;
layout(location = 3) in vec4 aStartColor;
layout(location = 4) in vec4 aEndColor;
layout(location = 5) in float aGradientAxis;
uniform vec2 uViewport;
out vec2 vLocal;
out vec2 vRectSize;
out float vRadius;
out vec4 vStartColor;
out vec4 vEndColor;
out float vGradientAxis;
void main() {
  vec2 pixel = aRect.xy + (aVertex * aRect.zw);
  vec2 clip = vec2(
    ((pixel.x / uViewport.x) * 2.0) - 1.0,
    1.0 - ((pixel.y / uViewport.y) * 2.0)
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  vLocal = aVertex * aRect.zw;
  vRectSize = aRect.zw;
  vRadius = aRadius;
  vStartColor = aStartColor;
  vEndColor = aEndColor;
  vGradientAxis = aGradientAxis;
}
`;

const RECT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vRectSize;
in float vRadius;
in vec4 vStartColor;
in vec4 vEndColor;
in float vGradientAxis;
out vec4 outColor;
void main() {
  vec2 halfSize = vRectSize * 0.5;
  vec2 center = halfSize;
  vec2 q = abs(vLocal - center) - (halfSize - vec2(vRadius));
  float distanceToEdge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vRadius;
  float alpha = 1.0 - smoothstep(0.0, 1.25, distanceToEdge);
  float t = vGradientAxis > 0.5
    ? (vLocal.x / max(vRectSize.x, 1.0))
    : (vLocal.y / max(vRectSize.y, 1.0));
  vec4 color = mix(vStartColor, vEndColor, clamp(t, 0.0, 1.0));
  outColor = vec4(color.rgb, color.a * alpha);
}
`;

const LINE_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPoint;
uniform vec2 uViewport;
void main() {
  vec2 clip = vec2(
    ((aPoint.x / uViewport.x) * 2.0) - 1.0,
    1.0 - ((aPoint.y / uViewport.y) * 2.0)
  );
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const LINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  outColor = uColor;
}
`;

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create shader program.');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Program link failed.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
};

interface RectProgramBindings {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  viewportLocation: WebGLUniformLocation;
}

interface LineProgramBindings {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  pointBuffer: WebGLBuffer;
  viewportLocation: WebGLUniformLocation;
  colorLocation: WebGLUniformLocation;
}

const getRectFillData = (command: FillRoundedRectCommand): {
  startColor: [number, number, number, number];
  endColor: [number, number, number, number];
  gradientAxis: number;
} => {
  if (command.fill.kind === 'solid') {
    const color = rgbaToFloatArray(parseCssColor(command.fill.color));
    return { startColor: color, endColor: color, gradientAxis: 0 };
  }

  return {
    startColor: rgbaToFloatArray(parseCssColor(command.fill.startColor)),
    endColor: rgbaToFloatArray(parseCssColor(command.fill.endColor)),
    gradientAxis: command.fill.direction === 'horizontal' ? 1 : 0,
  };
};

export class Webgl2VisualizationBackend implements VisualizationBackend {
  readonly kind = 'webgl2' as const;
  private readonly gl: WebGL2RenderingContext;
  private readonly rectBindings: RectProgramBindings;
  private readonly lineBindings: LineProgramBindings;
  private rectInstanceData = new Float32Array(14 * 256);
  private linePointData = new Float32Array(0);

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.gl = gl;
    this.rectBindings = this.createRectBindings();
    this.lineBindings = this.createLineBindings();
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  static create(canvas: HTMLCanvasElement): Webgl2VisualizationBackend | null {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      return null;
    }

    try {
      return new Webgl2VisualizationBackend(canvas, gl);
    } catch (error) {
      console.warn('Failed to initialize WebGL2 visualization backend.', error);
      return null;
    }
  }

  render(commands: readonly DrawCommand[], viewport: VisualizationViewport): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const rectCommands: FillRoundedRectCommand[] = [];
    const lineCommands: StrokePolylineCommand[] = [];
    for (const command of commands) {
      if (command.kind === 'fill-rounded-rect') {
        rectCommands.push(command);
      } else if (command.kind === 'stroke-polyline') {
        lineCommands.push(command);
      }
    }

    if (rectCommands.length > 0) {
      this.renderRectCommands(rectCommands, viewport);
    }

    if (lineCommands.length > 0) {
      this.renderLineCommands(lineCommands, viewport);
    }
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.rectBindings.vertexBuffer);
    gl.deleteBuffer(this.rectBindings.instanceBuffer);
    gl.deleteVertexArray(this.rectBindings.vao);
    gl.deleteProgram(this.rectBindings.program);
    gl.deleteBuffer(this.lineBindings.pointBuffer);
    gl.deleteVertexArray(this.lineBindings.vao);
    gl.deleteProgram(this.lineBindings.program);
  }

  private createRectBindings(): RectProgramBindings {
    const gl = this.gl;
    const program = createProgram(gl, RECT_VERTEX_SHADER, RECT_FRAGMENT_SHADER);
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const instanceBuffer = gl.createBuffer();
    const viewportLocation = gl.getUniformLocation(program, 'uViewport');
    if (!vao || !vertexBuffer || !instanceBuffer || !viewportLocation) {
      throw new Error('Failed to create rectangle renderer bindings.');
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    const stride = 14 * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 4 * 4);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 5 * 4);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 9 * 4);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 13 * 4);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
    return { program, vao, vertexBuffer, instanceBuffer, viewportLocation };
  }

  private createLineBindings(): LineProgramBindings {
    const gl = this.gl;
    const program = createProgram(gl, LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);
    const vao = gl.createVertexArray();
    const pointBuffer = gl.createBuffer();
    const viewportLocation = gl.getUniformLocation(program, 'uViewport');
    const colorLocation = gl.getUniformLocation(program, 'uColor');
    if (!vao || !pointBuffer || !viewportLocation || !colorLocation) {
      throw new Error('Failed to create line renderer bindings.');
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { program, vao, pointBuffer, viewportLocation, colorLocation };
  }

  private ensureRectCapacity(instanceCount: number): void {
    const requiredLength = instanceCount * 14;
    if (requiredLength <= this.rectInstanceData.length) {
      return;
    }

    let nextLength = this.rectInstanceData.length;
    while (nextLength < requiredLength) {
      nextLength *= 2;
    }
    this.rectInstanceData = new Float32Array(nextLength);
  }

  private renderRectCommands(commands: readonly FillRoundedRectCommand[], viewport: VisualizationViewport): void {
    this.ensureRectCapacity(commands.length);

    let offset = 0;
    for (const command of commands) {
      const fillData = getRectFillData(command);
      this.rectInstanceData[offset] = command.x;
      this.rectInstanceData[offset + 1] = command.y;
      this.rectInstanceData[offset + 2] = command.width;
      this.rectInstanceData[offset + 3] = command.height;
      this.rectInstanceData[offset + 4] = Math.max(0, command.radius);
      this.rectInstanceData.set(fillData.startColor, offset + 5);
      this.rectInstanceData.set(fillData.endColor, offset + 9);
      this.rectInstanceData[offset + 13] = fillData.gradientAxis;
      offset += 14;
    }

    const gl = this.gl;
    gl.useProgram(this.rectBindings.program);
    gl.uniform2f(this.rectBindings.viewportLocation, viewport.width, viewport.height);
    gl.bindVertexArray(this.rectBindings.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBindings.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.rectInstanceData.subarray(0, offset), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, commands.length);
    gl.bindVertexArray(null);
  }

  private renderLineCommands(commands: readonly StrokePolylineCommand[], viewport: VisualizationViewport): void {
    const gl = this.gl;
    gl.useProgram(this.lineBindings.program);
    gl.uniform2f(this.lineBindings.viewportLocation, viewport.width, viewport.height);
    gl.bindVertexArray(this.lineBindings.vao);

    for (const command of commands) {
      if (command.points.length === 0) {
        continue;
      }

      if (this.linePointData.length < command.points.length) {
        this.linePointData = new Float32Array(command.points.length);
      }
      this.linePointData.set(command.points.subarray(0, command.points.length), 0);
      const color = rgbaToFloatArray(parseCssColor(command.color));
      gl.uniform4f(this.lineBindings.colorLocation, color[0], color[1], color[2], color[3]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBindings.pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.linePointData.subarray(0, command.points.length), gl.DYNAMIC_DRAW);
      gl.lineWidth(command.width);
      gl.drawArrays(gl.LINE_STRIP, 0, Math.floor(command.points.length / 2));
    }

    gl.bindVertexArray(null);
  }
}
