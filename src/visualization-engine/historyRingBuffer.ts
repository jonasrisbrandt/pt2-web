export class HistoryRingBuffer {
  private readonly buffers: Float32Array[];
  private writeIndex = 0;
  private size = 0;

  constructor(
    private readonly laneCount: number,
    private readonly capacity: number,
  ) {
    this.buffers = Array.from({ length: laneCount }, () => new Float32Array(capacity));
  }

  reset(): void {
    this.writeIndex = 0;
    this.size = 0;
    for (const buffer of this.buffers) {
      buffer.fill(0);
    }
  }

  push(values: ArrayLike<number>): void {
    for (let lane = 0; lane < this.laneCount; lane += 1) {
      this.buffers[lane][this.writeIndex] = values[lane] ?? 0;
    }

    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size += 1;
    }
  }

  copyOrderedLane(lane: number, target: Float32Array): number {
    const source = this.buffers[lane];
    const count = Math.min(this.size, target.length);
    const start = this.size < this.capacity ? 0 : this.writeIndex;

    for (let index = 0; index < count; index += 1) {
      target[index] = source[(start + index) % this.capacity] ?? 0;
    }

    for (let index = count; index < target.length; index += 1) {
      target[index] = 0;
    }

    return count;
  }

  getSize(): number {
    return this.size;
  }
}
