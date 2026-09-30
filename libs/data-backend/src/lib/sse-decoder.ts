export interface SseFrame {
  event: string;
  data: string;
}

export function parseSseFrames(buffer: string): { frames: SseFrame[]; remainder: string } {
  const frames: SseFrame[] = [];
  // Normalise CRLF → LF
  const normalised = buffer.replace(/\r\n/g, '\n');
  const parts = normalised.split('\n\n');
  // All but the last part are complete frames (last may be incomplete)
  for (let i = 0; i < parts.length - 1; i++) {
    let event = 'message';
    let data = '';
    for (const line of parts[i].split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (data) frames.push({ event, data });
  }
  return { frames, remainder: parts[parts.length - 1] };
}
