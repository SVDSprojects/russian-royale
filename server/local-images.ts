import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { HttpError, id } from './core.js';
export async function saveLocalImage(buffer: Buffer, uploadsDir: string) {
  let output: Buffer;
  try {
    output = await sharp(buffer, { limitInputPixels: 16_000_000, animated: false })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new HttpError(400, 'Не удалось прочитать изображение. Максимум 16 мегапикселей.');
  }
  mkdirSync(uploadsDir, { recursive: true });
  const filename = id() + '.webp';
  writeFileSync(join(uploadsDir, filename), output, { flag: 'wx' });
  return filename;
}
