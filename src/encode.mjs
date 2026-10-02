import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// 프레임 목록 → MP4 인코딩.
// 각 프레임의 실제 수신 간격(t 차이)을 concat demuxer duration으로 사용해
// 실시간과 같은 타이밍으로 재생되는 CFR 영상을 만든다.
export function encodeFrames({ frames, listPath, outFile, fps = 30, crf = 20, vf }) {
  if (frames.length < 2) throw new Error(`captured frames are not enough: ${frames.length}`);

  let list = '';
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1 ? (frames[i + 1].t - frames[i].t) / 1000 : 0.1;
    list += `file '${frames[i].file.replaceAll("'", "'\\''")}'\n`;
    list += `duration ${Math.max(0.001, dur).toFixed(3)}\n`;
  }
  // concat demuxer 규약: 마지막 파일은 duration 없이 한 번 더 명시
  list += `file '${frames[frames.length - 1].file.replaceAll("'", "'\\''")}'\n`;
  writeFileSync(listPath, list);

  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-fps_mode', 'cfr', '-r', String(fps)];
  if (vf) args.push('-vf', vf);
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outFile,
  );

  const res = spawnSync(ffmpegPath, args, { stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`ffmpeg failed (${outFile})\n${res.stderr}`);
  return outFile;
}
