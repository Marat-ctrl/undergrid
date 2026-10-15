import { ROUTE_TRACK_CENTRES_METRES, depotRowOffsets } from './constructionDimensions';

type Point = [number, number];
interface YardTrack { role: 'lead' | 'siding'; row?: number; points: Point[]; }
export const DEPOT_STORAGE_LENGTH = 200;
export const DEPOT_TURN_RADIUS = 60;
const ENTRANCE_STRAIGHT = 20;
const MAX_LEAD_ANGLE = 25 * Math.PI / 180;
const ANGLE_STEP = .5 * Math.PI / 180;

function samples(from: number, to: number) {
  const count = Math.max(1, Math.ceil(Math.abs(to - from) / ANGLE_STEP));
  return Array.from({ length: count + 1 }, (_, i) => from + (to - from) * i / count);
}

/** Metre coordinates from the saved entrance; the saved end only defines the heading. */
export function depotGeometry(capacity: number) {
  const rows = depotRowOffsets(capacity), tracks: YardTrack[] = [];
  const radius = DEPOT_TURN_RADIUS, halfSpacing = ROUTE_TRACK_CENTRES_METRES / 2;
  let lastJoin = 0;
  for (const side of [-1, 1]) {
    const inlet = side * halfSpacing;
    const sidings = rows.flatMap((offset, row) => (offset < 0 ? -1 : 1) === side ? [{ offset, row }] : []);
    const angleFor = (shift: number) => Math.min(MAX_LEAD_ANGLE, Math.acos(Math.max(-1, 1 - Math.abs(shift) / (2 * radius))));
    const leadAngle = Math.max(0, ...sidings.map(({ offset }) => angleFor(Math.max(0, side * (offset - inlet)))));
    const entry = (angle: number): Point => [ENTRANCE_STRAIGHT + radius * Math.sin(angle), inlet + side * radius * (1 - Math.cos(angle))];
    const lead: Point[] = [[0, inlet], [ENTRANCE_STRAIGHT, inlet]];
    // Each siding leaves the same curved/diagonal lead at a different turnout.
    // Include every turnout in its samples so the rail joins have identical endpoints.
    const branchAngles = sidings.map(({ offset }) => angleFor(Math.max(0, side * (offset - inlet))));
    const angles = [...new Set([...samples(0, leadAngle), ...branchAngles])].sort((a, b) => a - b);
    for (const angle of angles) if (angle > 1e-10) lead.push(entry(angle));
    const diagonalJoins: Point[] = [];
    for (const { offset, row } of sidings) {
      const shift = side * (offset - inlet), angle = angleFor(shift);
      let branch: Point[], bendSide = side, turn = angle;
      if (shift < 0) {
        // A central odd-capacity siding bends inward from the straight entrance.
        bendSide = -side;
        branch = samples(0, angle).map(t => [ENTRANCE_STRAIGHT + radius * Math.sin(t), inlet + bendSide * radius * (1 - Math.cos(t))]);
      } else {
        turn = Math.min(angle, leadAngle);
        const along = turn ? Math.max(0, shift - 2 * radius * (1 - Math.cos(turn))) / Math.sin(turn) : 0;
        const start = entry(turn);
        const join: Point = [start[0] + along * Math.cos(turn), start[1] + side * along * Math.sin(turn)];
        if (along > 1e-8) diagonalJoins.push(join);
        branch = [join];
      }
      const join = branch.at(-1)!;
      for (const t of turn ? samples(0, turn).slice(1) : []) branch.push([
        join[0] + radius * (Math.sin(turn) - Math.sin(turn - t)),
        join[1] + bendSide * radius * (Math.cos(turn - t) - Math.cos(turn)),
      ]);
      // Snap analytic endpoints to the exact row ordinate before adding storage straights.
      branch.at(-1)![1] = offset;
      lastJoin = Math.max(lastJoin, branch.at(-1)![0]);
      tracks.push({ role: 'siding', row, points: branch });
    }
    diagonalJoins.sort((a, b) => a[0] - b[0]);
    lead.push(...diagonalJoins);
    tracks.push({ role: 'lead', points: lead });
  }
  // Keep the original 200 m usable decks, extending the rear rather than squeezing the throat.
  const storageStart = Math.max(80, Math.ceil(lastJoin + 5));
  const platformStart = storageStart + 5, platformEnd = platformStart + DEPOT_STORAGE_LENGTH;
  const trackEnd = platformEnd + 5;
  for (const track of tracks) if (track.role === 'siding') track.points.push([trackEnd, rows[track.row!]]);
  return { rows, tracks, storageStart, platformStart, platformEnd, trackEnd };
}
