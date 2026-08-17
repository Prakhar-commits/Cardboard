/**
 * A one-at-a-time work queue.
 *
 * Every pipeline stage shells out to ffmpeg, which will happily saturate the
 * box. Two concurrent uploads on a small instance means both run slowly, both
 * risk the platform's health-check timeout, and neither reports why. Running
 * them in series is slower on paper and far more predictable in a demo — and
 * "3rd in queue" is an honest thing to show a viewer.
 */

type Task = () => Promise<void>;

interface QueuedTask {
  task: Task;
  onPositionChange: (position: number) => void;
}

const pending: QueuedTask[] = [];
let running = false;

function notifyPositions(): void {
  // 1-based: the job at the head of the queue is "next up" while the current
  // task finishes. A running job reports 0 via its own status.
  pending.forEach((entry, index) => entry.onPositionChange(index + 1));
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;

  while (pending.length > 0) {
    const next = pending.shift()!;
    next.onPositionChange(0);
    notifyPositions();
    try {
      await next.task();
    } catch {
      // Tasks own their own failure reporting (failJob / failApplyJob). A
      // throw here must not stop the queue from serving everyone behind it.
    }
  }

  running = false;
}

/**
 * Enqueues work. `onPositionChange` fires with the job's place in line
 * (0 once it starts) so the UI can show a real wait instead of a spinner.
 */
export function enqueue(task: Task, onPositionChange: (position: number) => void): void {
  pending.push({ task, onPositionChange });
  notifyPositions();
  void drain();
}

export function queueDepth(): number {
  return pending.length + (running ? 1 : 0);
}
