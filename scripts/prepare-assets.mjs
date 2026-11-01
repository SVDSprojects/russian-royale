import sharp from 'sharp';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dest = resolve('public/assets');
await mkdir(dest, { recursive: true });
const source = process.argv[2];
if (source) {
  await copyFile(source, resolve(dest, 'teacher-sheet.png'));
  const m = await sharp(source).metadata();
  const cell = m.width / 5;
  for (const [i, emotion] of ['neutral', 'happy', 'strict', 'surprised', 'explaining'].entries()) {
    const left = Math.round(i * cell),
      right = Math.round((i + 1) * cell);
    await sharp(source)
      .extract({ left, top: 0, width: right - left, height: m.height })
      .resize({ height: 640 })
      .png()
      .toFile(resolve(dest, `teacher-${emotion}.png`));
  }
}
const icon = await readFile('public/favicon.svg');
for (const size of [192, 512])
  await sharp(icon)
    .resize(size, size)
    .png()
    .toFile(resolve(dest, `icon-${size}.png`));
console.log('Project assets prepared.');
